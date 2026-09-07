# 来源与许可说明

## 项目自有代码

本仓库中的场景代码、界面、动画适配及L-03概念设计尚未单独指定开源许可证。仓库公开用于展示和访问；需要额外授权时请联系仓库维护者。

## NASA模型

16套模型来自NASA官方发布页面或官方NASA-3D-Resources仓库。模型来自不同任务及概念设计；机遇号与勇气号采用同一车型模型。

- [逐模型来源、统计与处理说明](outputs/NASA模型说明.txt)
- [模型元数据](outputs/assets/models/metadata.json)
- [NASA官方资源库](https://github.com/nasa/NASA-3D-Resources)
- [NASA媒体使用说明](https://www.nasa.gov/nasa-brand-center/images-and-media/)

官方模型的几何、材质与已有纹理予以保留。部分网格被分组以驱动轮子、滚筒或旋翼；运行时还会合并静态零件并调整展示比例。地形、光照与艺术性动画由本项目实现。原始资源中的署名及其适用条件继续有效。

本项目不代表NASA，不表示NASA的认可或背书。

## 第三方软件与贴图

| 资源 | 许可／说明 |
| --- | --- |
| Three.js及随包附带的相关模块 | MIT |
| Draco解码器 | Apache License 2.0 |
| Poly Haven：Gravel Stones贴图 | CC0 1.0 |
| esbuild构建工具 | MIT；通过npm安装，不嵌入场景资源 |

Three.js和Draco的许可证文本保存在[THIRD-PARTY-LICENSES.txt](outputs/THIRD-PARTY-LICENSES.txt)。其他来源链接见[素材来源.txt](outputs/素材来源.txt)。转发离线分享包时请保留上述文件。
