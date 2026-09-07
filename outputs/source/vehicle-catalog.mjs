export const VEHICLE_CATEGORIES={rover:'探测车与机器人',lander:'着陆器',flight:'飞行器与火箭',space:'太空观测与探索'};
const nasa=(id,name,english,category,mode,description,folder,extra={})=>({id,name,english,category,mode,description,credit:'NASA官方资源库',url:`./assets/models/${id}.glb`,source:'https://github.com/nasa/NASA-3D-Resources/tree/master/'+('3D Models/'+folder).split('/').map(encodeURIComponent).join('/'),...extra});
export const VEHICLES=[
  {id:'perseverance',name:'毅力号',english:'Perseverance',category:'rover',mode:'rover',credit:'NASA/JPL-Caltech',description:'火星探测车 · 六轮巡航',url:'./assets/models/perseverance.glb',source:'https://science.nasa.gov/resource/mars-perseverance-rover-3d-model/',wheelCount:6},
  {id:'curiosity',name:'好奇号',english:'Curiosity',category:'rover',mode:'rover',credit:'NASA/JPL-Caltech',description:'火星科学实验室 · 六轮巡航',url:'./assets/models/curiosity.glb',source:'https://science.nasa.gov/resource/curiosity-rover-3d-model/',wheelCount:6},
  {id:'opportunity',name:'机遇号／勇气号',english:'Opportunity / Spirit',category:'rover',mode:'rover',credit:'NASA/JPL-Caltech',description:'太阳能火星车 · 共用车型模型',url:'./assets/models/opportunity.glb',source:'https://science.nasa.gov/resource/spirit-and-opportunity-rover-3d-model/',wheelCount:6},
  nasa('sev','SEV载人探索车','Space Exploration Vehicle','rover','rover','加压座舱 · 十二轮巡航','Space Exploration Vehicle',{wheelCount:12}),
  nasa('rassor','RASSOR采掘机器人','RASSOR','rover','rover','四轮底盘 · 双滚筒作业演示','Regolith Advanced Surface Systems Operations Robot (RASSOR)',{wheelCount:4,displayExtent:3.8}),
  {id:'concept',name:'L-03概念车',english:'Lunar Surveyor',category:'rover',mode:'rover',credit:'原创概念设计',description:'原创六轮月面概念探测车'},
  nasa('apollo','阿波罗登月舱','Apollo Lunar Module','lander','lander','登月舱 · 月面驻留展示','Apollo Lunar Module',{displayExtent:6.5}),
  nasa('insight','洞察号着陆器','InSight','lander','lander','太阳翼与机械臂展开 · 驻留展示','InSight Cruise Lander',{displayExtent:4.8}),
  nasa('viking','维京号着陆器','Viking Lander','lander','lander','经典火星着陆器 · 驻留展示','Viking Lander',{displayExtent:4.5}),
  nasa('ingenuity','机智号直升机','Ingenuity','flight','hover','同轴双旋翼 · 悬浮展示','Ingenuity Mars Helicopter',{displayExtent:2.8,rotors:true}),
  nasa('shuttle','航天飞机','Space Shuttle','flight','hover','轨道飞行器 · 悬浮展示','Space Shuttle (D)',{displayExtent:9}),
  nasa('saturn','土星五号火箭','Saturn V','flight','lander','阿波罗运载火箭 · 竖立展示','Saturn V',{displayExtent:13}),
  nasa('webb','詹姆斯·韦布空间望远镜','James Webb Space Telescope','space','hover','分段主镜与遮阳板 · 悬浮展示','James Webb Space Telescope (A)',{displayExtent:9}),
  nasa('hubble','哈勃空间望远镜','Hubble Space Telescope','space','hover','镜筒与太阳翼 · 悬浮展示','Hubble Space Telescope (B)',{displayExtent:8}),
  nasa('voyager','旅行者探测器','Voyager','space','hover','高增益天线与仪器长杆 · 悬浮展示','Voyager Probe (B)',{displayExtent:8}),
  nasa('cassini','卡西尼－惠更斯号','Cassini–Huygens','space','hover','土星探测器组合 · 悬浮展示','Cassini-Huygens (A)',{displayExtent:7}),
  nasa('iss','国际空间站','International Space Station','space','hover','桁架、舱段与太阳翼 · 悬浮展示','International Space Station (ISS) (D) (IGOAL)',{displayExtent:12}),
];
