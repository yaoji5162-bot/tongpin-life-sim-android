# Aevum（Android）

孵蛋、兽耳角色成长、日常相处、AI 对话与生图。当前界面以 v9 试玩为基础；API 均位于独立设置页，模型通过渠道 `/models` 拉取。

## 覆盖安装与存档

- **不要卸载旧版，也不要清除应用数据。** 下载新 APK 后直接安装覆盖。
- 包名固定 `com.example.tongpin`，签名必须与旧 APK 一致；版本号由 GitHub Actions 运行序号递增。
- 构建先比对旧版签名／固定证书，密钥缺失或不符会停止，不会随机生成新密钥。
- 原有缓存 `aevum-signing-key-v1` 暂用于恢复旧密钥。缓存可能过期，长期维护须将**同一把原密钥**备份到仓库 Secret `AEVUM_KEYSTORE_BASE64`。可同时设置 `AEVUM_STORE_PASSWORD`、`AEVUM_KEY_ALIAS`、`AEVUM_KEY_PASSWORD`；默认沿用旧测试签名配置。不要创建一把新密钥替代。
- Android 存档保存在应用私有目录，由 AtomicFile 原子写入，另保留上一份；文件名与 WebView 加载地址固定。网页使用 IndexedDB。
- 自动保存蛋、角色、性格、成长、立绘、聊天与非敏感配置。API Key 只留在当前页面内存中，不进入存档或导出文件。
- 在「设置 → 角色」导出／导入 JSON 备份，换设备前务必导出。换蛋、清空聊天会先确认。
- 存档带 `schemaVersion`；高版本存档不会被旧版自动覆盖，损坏时尝试上一份备份。后续调整字段必须提供迁移并通过已有存档测试。
- 原 v9 下载试玩没有自动存档，已经关闭或刷新的旧试玩内容无法追溯恢复；本版本开始持久化。旧版“同频人生”的 localStorage 保留原样，不强行映射到新养成系统。
- 本次固定保存地址为 `file:///android_asset/index.html`；后续不可随意修改。

## 构建

推送 main 或手动运行 **Build Android APK**。完成后下载 `aevum-android-apk` 中的 APK。CI 使用 Java 17、Gradle 8.9、AGP 8.7.3、SDK 35，最低 Android 6.0。

本地需准备同一把 `ci/aevum.keystore`、Android SDK 与 Gradle；不能用随机 debug key 替代。传统图标由工作流从原 SVG 生成。生产发行前应安排独立的密钥保管流程，已安装版本的签名不能直接切换。

```sh
node tests/save.test.cjs
gradle assembleDebug
```

Android 的 API 请求由本地桥接完成，避免 file WebView 受到服务端 CORS 限制；不会向其他网站注入桥接。浏览器直接打开 HTML 仍需要渠道允许跨域。

## 维护边界

保留已有功能，使用小范围增量修改。不要清数据来实现升级，不改包名／存档位置／签名；更改存档结构时先验证旧存档。仓库没有保存用户的 API Key 或任何角色存档。
