# Girlfriend Travel Map

一个适合部署到 GitHub Pages 的中国旅行轨迹网页骨架，包含：

- 中国足迹地图
- 城市详情和照片墙
- `travels.json` 数据源
- 本地照片导入脚本
- 高德逆地理编码接入位

## 1. 替换高德 Key

编辑项目根目录下的 `.env`：

```env
AMAP_WEB_SERVICE_KEY=你的key
```

把 `你的key` 替换成你刚申请到的高德 `Web 服务 key`。

## 2. 安装依赖

当前环境里没有现成的 `npm`，但项目已经准备好依赖声明。你本地有包管理器后执行：

```bash
npm install
```

## 3. 启动页面

```bash
npm run dev
```

## 4. 导入照片

把照片放进 `imports/` 或它下面的子目录，然后执行：

```bash
npm run import-photos
```

脚本会：

- 读取 EXIF 时间和 GPS
- 优先调用高德逆地理编码
- 没有可用 API 结果时，尝试用内置城市坐标兜底
- 把照片复制到 `public/photos/imported/`
- 生成 `imports/review.json`

## 5. 确认并合并

打开 `imports/review.json`，把要导入的条目改成：

```json
"confirmed": true
```

然后执行：

```bash
npm run merge-review
```

已确认的照片会并入 `src/data/travels.json`。

## 6. 部署到 GitHub Pages

```bash
npm run build
```

构建产物在 `dist/`。

项目已经自带 GitHub Pages 工作流：

- 文件位置：`.github/workflows/deploy.yml`
- 触发条件：推送到 `main` 分支
- 部署内容：`dist/`

首次启用时，在 GitHub 仓库设置里确认：

- `Settings -> Pages`
- `Build and deployment -> Source`
- 选择 `GitHub Actions`

之后每次你 push 到 `main`，页面就会自动更新。
