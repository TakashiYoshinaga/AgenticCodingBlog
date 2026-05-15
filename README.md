# 🌍 Codex Solar System Demo

## 🚀 [View Live Demo (Click Here!)](https://takashiyoshinaga.github.io/AgenticCodingBlog/)

An interactive 3D solar system visualization built with Three.js. The demo shows the Sun, all 8 planets, Earth's Moon, orbit paths, labels, a star field, and optional WebXR AR viewing on supported devices.

## Blog Posts

- 日本語: [CodexでWeb3Dコンテンツを作る](https://qiita.com/Tks_Yoshinaga/items/e338160c5c8c55403267)
- English: [Building Web3D Content with Codex](https://www.linkedin.com/pulse/building-web3d-content-codex-takashi-yoshinaga-mpdrc/)

## Features

- Full-screen 3D solar system scene
- OrbitControls camera rotation and zoom
- WASD camera movement
- Animated planetary orbits and rotations
- Earth's Moon
- WebXR immersive AR support with AR-specific lighting and scale controls

## How to Use

| Input | Action |
|-------|--------|
| Drag | Rotate the view |
| Scroll wheel | Zoom in / out |
| `W` `A` `S` `D` | Move camera |
| **View in AR** button | Start AR mode on WebXR-compatible devices |
| Right controller stick up/down in AR | Scale the solar system |

The on-screen WebXR status message shows whether AR is available in the current browser and context.

## Tech Stack

- [Three.js](https://threejs.org/) v0.164.1
- OrbitControls
- WebXR Device API
- Vanilla JavaScript (ES Modules)

## License

See [LICENSE](LICENSE).
