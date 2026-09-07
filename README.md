# Lunar Surveyor｜月面漫游

基于Three.js的交互式三维月面与航天模型展示项目，包含**17个模型选项：16套NASA官方发布模型与原创L-03概念车**。支持鼠标旋转、缩放、自由飞行，以及单文件离线体验。

[下载离线版本](https://github.com/Onward0131/lunar-surveyor/releases/latest) · [模型来源](outputs/NASA模型说明.txt) · [许可说明](NOTICE.md) · [反馈问题](https://github.com/Onward0131/lunar-surveyor/issues)

## 功能

- **分类模型库**：按探测车、着陆器、飞行器与火箭、太空观测与探索分类，支持上一款／下一款切换。
- **三维月面场景**：程序化地形、扫描地表材质、光照、阴影、轮迹与扬尘。
- **不同展示方式**：探测车巡航、着陆器驻留、航天器悬浮；SEV十二轮、RASSOR双滚筒和机智号双旋翼具有独立动画。
- **自由观察**：轨道视角、平移、模型跟随、自由飞行、暂停和速度调整。
- **离线使用**：单文件HTML内嵌模型、贴图、运行代码和Draco解码器。
- **按需加载**：仅加载当前选中的模型，切换时释放上一模型的图形资源。

> 月面是统一展示环境，模型来自不同任务与概念设计。部分模型按展示比例缩放；行驶、悬浮和旋翼动画属于艺术性演示，并非完整任务或动力学仿真。

## 模型目录

| 分类 | 模型 | 展示方式 |
| --- | --- | --- |
| 探测车与机器人 | 毅力号Perseverance | 六轮巡航，默认模型 |
| 探测车与机器人 | 好奇号Curiosity | 六轮巡航 |
| 探测车与机器人 | 机遇号／勇气号Opportunity / Spirit | 共用车型，六轮巡航 |
| 探测车与机器人 | SEV载人探索车 | 十二轮巡航 |
| 探测车与机器人 | RASSOR采掘机器人 | 四轮巡航与双滚筒动画 |
| 探测车与机器人 | L-03概念车 | 原创六轮月面概念车 |
| 着陆器 | 阿波罗登月舱 | 驻留展示 |
| 着陆器 | 洞察号InSight | 太阳翼与机械臂展开 |
| 着陆器 | 维京号Viking | 驻留展示 |
| 飞行器与火箭 | 机智号Ingenuity | 悬浮与同轴双旋翼动画 |
| 飞行器与火箭 | 航天飞机Space Shuttle | 悬浮展示 |
| 飞行器与火箭 | 土星五号Saturn V | 竖立展示 |
| 太空观测与探索 | 詹姆斯·韦布空间望远镜 | 悬浮展示 |
| 太空观测与探索 | 哈勃空间望远镜 | 悬浮展示 |
| 太空观测与探索 | 旅行者Voyager | 悬浮展示 |
| 太空观测与探索 | 卡西尼－惠更斯号 | 悬浮展示 |
| 太空观测与探索 | 国际空间站ISS | 悬浮展示 |

机遇号与勇气号使用同一种车型，合计为一个模型选项。逐模型的网格数量、文件大小和来源记录见[metadata.json](outputs/assets/models/metadata.json)。

## 快速开始

### 方式一：直接体验离线版

前往[Releases](https://github.com/Onward0131/lunar-surveyor/releases/latest)，下载以下任一文件：

- **`lunar-surveyor-17-models.html`**：双击打开，无需安装Node.js或启动服务器。
- **`lunar-surveyor-17-models-share.zip`**：内含离线HTML、可修改的工程源码、使用说明及来源文件；完整解压后双击“打开月面漫游.html”。

发布页同时提供`SHA256SUMS.txt`。以发布页显示的文件大小和校验值为准；转发分享包时请保留来源与许可文件。

建议使用支持WebGL2、WebAssembly和硬件加速的桌面浏览器。完整模型库文件较大，首次打开和切换复杂模型时需要等待加载。

### 方式二：从仓库运行

需要Git、Node.js22或更高版本及随Node.js提供的npm。开发环境已使用Node.js24验证。

```sh
git clone https://github.com/Onward0131/lunar-surveyor.git
cd lunar-surveyor
npm start
```

打开<http://127.0.0.1:4173>。仓库包含已构建的`outputs/app.js`，因此直接预览无需先安装依赖。按`Ctrl+C`停止服务。

### 修改、检查与构建

```sh
npm ci
npm run check
npm run build
npm start
```

首次安装依赖需要联网。`npm run build`更新`outputs/app.js`与模型选择列表，并生成可由静态服务器托管的`dist/`目录。

### 生成单文件HTML

```sh
npm run build
npm run offline
```

输出文件为`outputs/打开月面漫游.html`，可双击离线运行。导出文件和ZIP不纳入Git历史，已发布版本通过Releases提供。

## 操作

| 输入 | 操作 |
| --- | --- |
| 左键拖动 | 旋转视角 |
| 鼠标滚轮 | 缩放 |
| 右键拖动 | 平移并解除跟随 |
| 左上角模型选择器 | 按分类切换模型 |
| 上一款／下一款 | 依次浏览模型 |
| `R`／聚焦模型 | 返回当前模型并恢复跟随 |
| 空格／暂停动画 | 暂停或继续 |
| `F`／自由飞行 | 切换自由飞行模式 |
| `W`、`A`、`S`、`D` | 自由飞行时移动 |
| `Q`／`E` | 自由飞行时下降／上升 |
| `Shift` | 自由飞行时加速 |
| 触屏单指／双指 | 旋转／缩放与平移 |

切换模型会自动聚焦，并保留速度与暂停设置。

## 项目结构

```text
.
├── README.md
├── NOTICE.md                   # 自有代码与第三方素材的许可说明
├── package.json
├── package-lock.json
├── preview.mjs                 # 使用Node.js内置模块的预览服务器
├── export-offline.mjs           # 单文件HTML导出
├── scripts/
│   └── check.mjs                # 语法、目录及本地资源结构检查
└── outputs/
    ├── index.html              # 界面与样式
    ├── app.js                  # 已构建的运行文件
    ├── source/
    │   ├── scene.mjs           # 地形、光照、动画与交互
    │   ├── vehicle-catalog.mjs # 模型目录、分类及展示参数
    │   ├── nasa-vehicles.mjs   # GLB加载、离线解码与资源释放
    │   ├── vehicle-rig.mjs     # 轮组、滚筒与旋翼
    │   └── build.mjs          # 构建脚本
    ├── assets/
    │   ├── models/             # 16套GLB与metadata.json
    │   ├── draco/              # 本地Draco解码器
    │   └── gravel_stones_*.jpg # 地表颜色、法线与粗糙度贴图
    ├── NASA模型说明.txt
    ├── 素材来源.txt
    ├── THIRD-PARTY-LICENSES.txt
    └── 使用说明.md
```

## 技术与验证

| 组件 | 用途 |
| --- | --- |
| Three.js0.181.1 | WebGL渲染、相机与场景管理 |
| GLTFLoader／DRACOLoader | 官方GLB及压缩网格加载 |
| OrbitControls | 旋转、缩放与平移 |
| esbuild0.25.12 | JavaScript打包 |
| Node.js内置模块 | 静态预览与离线导出 |

`npm run check`检查JavaScript语法、模型目录一致性、GLB结构、本地贴图与解码器文件。它不替代浏览器中的视觉或性能测试。

资源保留官方网格与已有贴图；部分官方模型仅使用材质颜色，本身不含位图纹理。国际空间站等复杂模型对显存和渲染性能要求更高，帧率取决于设备、窗口分辨率和所选模型。

## 常见问题

**打开`outputs/index.html`后模型没有加载**

请运行`npm start`并使用本地HTTP地址，或使用Releases提供的单文件HTML。普通多文件版本需要通过服务器加载本地素材。

**提示4173端口被占用**

关闭此前启动的预览服务，再执行`npm start`。

**画面黑屏或加载较慢**

检查浏览器是否支持WebGL2并启用硬件加速。等待大型模型完成加载；遇到错误时可使用界面中的重试按钮，或选择体积较小的模型。

**为什么部分航天器出现在月面上方？**

这里是统一模型展示场景。悬浮方式方便观察各个角度，不表示这些航天器曾在月球执行相应任务。

## 来源与许可

- **NASA模型**：来自NASA官方发布页面及[NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources)。逐模型链接、统计及修改说明见[NASA模型说明.txt](outputs/NASA模型说明.txt)，使用应遵守[NASA媒体使用说明](https://www.nasa.gov/nasa-brand-center/images-and-media/)及资源标注。
- **地表贴图**：Poly Haven的Gravel Stones，CC0。
- **Three.js**：MIT许可。
- **Draco**：Apache License 2.0。

项目自有源码尚未单独指定开源许可证；公开仓库不改变第三方素材的许可条件。完整说明见[NOTICE.md](NOTICE.md)及[第三方许可证](outputs/THIRD-PARTY-LICENSES.txt)。本项目不代表NASA，也不表示NASA对本项目的认可或背书。

## 反馈

欢迎通过[Issues](https://github.com/Onward0131/lunar-surveyor/issues)反馈问题。请附上模型名称、操作步骤、浏览器版本和设备信息，便于复现。
