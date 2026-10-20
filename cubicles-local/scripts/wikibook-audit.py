import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def isolate(workspace):
    workspace = Path(workspace).resolve()
    sys.dont_write_bytecode = True

    def inside(value):
        if isinstance(value, int):
            return True
        try:
            return Path(os.fsdecode(value)).resolve().is_relative_to(workspace)
        except (TypeError, ValueError):
            return False

    def audit(event, args):
        if event == 'open':
            mode = args[1]
            flags = args[2]
            writing = isinstance(mode, str) and any(flag in mode for flag in 'wax+')
            writing = writing or isinstance(flags, int) and bool(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            if writing and not inside(args[0]):
                raise PermissionError('audit forbids writing outside its temporary directory')
        if event in {'os.remove', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.truncate', 'os.utime', 'os.symlink', 'os.link', 'os.rename'}:
            paths = args[:2] if event in {'os.rename', 'os.symlink', 'os.link'} else args[:1]
            if not all(inside(value) for value in paths):
                raise PermissionError('audit forbids filesystem mutation outside its temporary directory')
        if event in {'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn', 'sqlite3.connect'}:
            raise PermissionError('audit forbids networking, processes and database connections')

    sys.addaudithook(audit)


def inspect_source(source):
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    dotenv.dotenv_values = lambda *args, **kwargs: {}
    sys.path.insert(0, str(source))
    import app as application
    from sqlalchemy.dialects import postgresql
    from wikibook_app.extensions import db
    from wikibook_app.permissions import ENDPOINT_PERMISSION_MAP

    routes = []
    for rule in sorted(application.app.url_map.iter_rules(), key=lambda item: (item.rule, item.endpoint)):
        handler = application.app.view_functions[rule.endpoint]
        routes.append({
            'path': rule.rule, 'methods': sorted(rule.methods), 'endpoint': rule.endpoint,
            'handlerModule': handler.__module__, 'permission': ENDPOINT_PERMISSION_MAP.get(rule.endpoint),
            'migrationStatus': 'pending',
        })
    tables = []
    for table in sorted(db.metadata.tables.values(), key=lambda item: item.name):
        tables.append({
            'name': table.name,
            'columns': [{'name': column.name, 'type': str(column.type.compile(dialect=postgresql.dialect())), 'nullable': column.nullable, 'primaryKey': column.primary_key, 'foreignKeys': sorted(key.target_fullname for key in column.foreign_keys)} for column in table.columns],
            'uniqueConstraints': sorted([sorted(column.name for column in constraint.columns) for constraint in table.constraints if constraint.__class__.__name__ == 'UniqueConstraint']),
            'migrationStatus': 'pending',
        })
    sources = []
    background = []
    for file in sorted(source.rglob('*.py')):
        relative = file.relative_to(source)
        if any(part.startswith('.') or part in {'node_modules', 'archive', '__pycache__', 'backups', 'artifacts', 'static', 'instance'} for part in relative.parts):
            continue
        content = file.read_bytes()
        sources.append({'path': relative.as_posix(), 'sha256': hashlib.sha256(content).hexdigest()})
        tree = ast.parse(content.decode('utf-8'))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in {'enqueue', 'enqueue_call', 'enqueue_in', 'enqueue_at', 'delay'}:
                background.append({'source': relative.as_posix(), 'line': node.lineno, 'expression': ast.unparse(node.func), 'migrationStatus': 'pending'})
    router = source / 'frontend/src/router/index.js'
    if router.exists():
        content = router.read_bytes()
        sources.append({'path': router.relative_to(source).as_posix(), 'sha256': hashlib.sha256(content).hexdigest()})
    conditions = [{key: option[key] for key in ['value', 'label', 'category', 'requires_value', 'default_value', 'default_target_id', 'supports_time_limit'] if key in option} for option in application.app.config['BADGE_CONDITION_OPTIONS']]
    return {
        'kind': 'wikibook-runtime-baseline', 'version': 1,
        'scope': {'routes': 'Flask URL map imported with isolated configuration', 'tables': 'declared SQLAlchemy metadata; no database connected', 'conditions': 'registered runtime condition catalog', 'background': 'static enqueue call sites; not a complete worker dependency inventory', 'sourceDataRead': False, 'networkAllowed': False},
        'summary': {'routes': len(routes), 'apiRoutes': sum(route['path'].startswith('/api/') for route in routes), 'tables': len(tables), 'conditions': len(conditions), 'backgroundCallSites': len(background)},
        'routes': routes, 'tables': tables, 'conditions': conditions, 'backgroundCallSites': background, 'sourceFiles': sources,
        'remaining': ['Compare declared metadata against an authorized database snapshot.', 'Inventory SPA routes, attachment storage and full worker/runtime dependencies.', 'Capture per-endpoint request/response and authorization contracts.'],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--worker', action='store_true')
    args = parser.parse_args()
    source = args.source.resolve()
    if args.worker:
        isolate(Path.cwd())
        print(json.dumps(inspect_source(source), ensure_ascii=False))
        return
    if args.output is None:
        parser.error('--output is required')
    if not (source / 'app.py').is_file():
        parser.error('--source must contain app.py')
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = bool(subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip())
    with tempfile.TemporaryDirectory(prefix='cubicles-wikibook-audit-') as temporary:
        environment = {'PATH': os.environ.get('PATH', ''), 'HOME': temporary, 'TMPDIR': temporary, 'DATABASE_URL': 'sqlite://', 'AUTO_INIT_DB': 'false', 'SECRET_KEY': 'isolated-source-audit', 'APP_LOG_FILE': '', 'ACCOUNT_LINK_SECRET': '', 'ACCOUNT_LINK_INTERVIEW_URL': '', 'ACCOUNT_LINK_WIKIBOOK_URL': ''}
        result = subprocess.run([sys.executable, '-I', str(Path(__file__).resolve()), '--source', str(source), '--worker'], cwd=temporary, env=environment, capture_output=True, text=True, timeout=120)
        if result.returncode:
            raise RuntimeError(f'Isolated source audit failed without publishing a manifest:\n{result.stderr}')
    manifest = json.loads(result.stdout)
    manifest.update(sourceCommit=commit, sourceDirty=dirty)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, delete=False) as output:
        json.dump(manifest, output, ensure_ascii=False, indent=2)
        output.write('\n')
        staged = output.name
    os.replace(staged, args.output)
    print(json.dumps({'ok': True, 'output': str(args.output), **manifest['summary']}))


if __name__ == '__main__':
    main()
