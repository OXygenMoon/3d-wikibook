import { DEFAULT_ZONES, generateOffices } from './community.js';
export const neighborhoods = DEFAULT_ZONES.map(z=>({...z}));
export const offices = generateOffices(DEFAULT_ZONES);
export const home = offices[0];
export const spawn = {x:home.x,z:home.z+2.5};
export const worldBounds=70;

export const outfits = ['#a6b79a', '#b6a4cc', '#87a8b8', '#d2aa86', '#beca78', '#c58d83'];
export const seedMessages = [
  { id: 'welcome', name: '社区小助手', text: '欢迎来到格子社区，找到你的小天地吧。🌿', system: true, time: Date.now() },
];

// Localize only old built-in sample labels; preserve user-authored office content.
export const legacyLabels = {
  "Cubicles": "格子社区",
  "A little room for big ideas.": "小小工位，装下大大梦想。",
  "Smartatest": "智测工坊",
  "Good ideas deserve a workspace.": "好点子，也需要一个好工位。",
  "ZORTH": "造物空间",
  "Make something worth sharing.": "创造值得分享的作品。",
  "Calerto": "轻时光",
  "A quieter kind of productivity.": "专注，也可以安静从容。",
  "StyleX": "风格实验室",
  "Design without the noise.": "让设计回归灵感。",
  "Treemansion": "树屋工作室",
  "Room to grow.": "给成长留一点空间。",
  "Dance": "律动空间",
  "Bring a little movement.": "给生活一点节奏。",
  "Companion": "伙伴工坊",
  "Build better, together.": "一起创造，彼此陪伴。",
  "vibeCMS": "灵感手记",
  "Make your corner of the internet.": "记录自己的互联网角落。",
  "HITLOOP": "回响工作室",
  "A good idea, on repeat.": "好想法，值得不断回响。",
  "LifeMD": "暖心小站",
  "A little more human.": "让科技多一点温度。",
  "Yoink.website": "拾光空间",
  "A home for your next thing.": "为下一个想法安个家。",
  "Torch Labs": "火炬实验室",
  "Small team. Bright ideas.": "小小团队，明亮想法。",
  "We Bid This City": "邻里共创",
  "Find your people.": "找到志同道合的伙伴。",
  "imnotArt": "随心艺术",
  "A place to make a little mess.": "允许灵感自由生长。",
  "VectorizeThis": "向量工作室",
  "A different point of view.": "从不同角度看世界。",
  "Shepherd": "牧光工坊",
  "Thoughtful tools for everyday.": "用心做好日常小事。",
  "Mastline": "远帆工作室",
  "An open door to possibility.": "为可能性打开一扇门。",
  "Paws & Pairs": "爪爪搭档",
  "Good company, all day.": "让好伙伴一直在身边。",
  "The Recreation Room": "休闲小屋",
  "Take a well-earned break.": "忙碌之余，放松一下。"
};
