# Agent Note：目录列举包含子级文件（`host.listDirectory` 的 includeFiles）

Status: implemented

[English](2026-08-24-directory-listing-include-files.md) | 中文

## 问题

browse 目录列举只返回目录——它为工作区选择器而生，而选择器只能进入目录。任何要展示目录实际内容的 GUI 表面（文件浏览器）都没有取到文件的协议通路：封闭的 RPC 映射不提供其他文件系统列举，而 dynamic-runner 的包内 RPC（`harness.handle`）对静态组合的客户端插件并不存在。

## 决策

`host.listDirectory` 增加一个按调用的可选参数，而不是第二个方法：`includeFiles: true` 在目录之后追加子级常规文件，与该层级的 `maxEntries` 上限和 `truncated` 标志合并计算。`DirectoryEntry` 增加必填的 `kind: 'directory' | 'file'` 判别字段，让包含文件的列举在协议上自描述；crumb 恒为 `kind: 'directory'`。选择器流程从不设置该选项，其行为不变。

### 分类移入流内

browse 后端此前只把目录与符号链接放入有界窗口，并在窗口截断之后才探测符号链接。混入文件后，这种延迟分类会破坏契约顺序：指向文件的符号链接按名称落在目录块里，直到探测才发现自己是文件，于是一行文件插在目录行之间。因此分类提前到窗口插入之前——`kindOf` 在流内解析每个 dirent（dirent 直接给出种类，符号链接由竞速的 `stat` 探测判定，断链判为空），`ListingCandidate` 收缩为 `{ name, kind }`。窗口顺序——目录在前、文件在后，各自按名称升序——与保留的头部都是精确的；窗口后的探测阶段随之消失。

## 落选方案

- **第二个协议方法（`host.listFiles`）。** 落选：为一个标志位的差异复制整套有界窗口扫描、祖先链与错误映射，此后每次列举改进都要落地两遍。
- **扩展 `ctx.fs` seam。** 落选，理由已记录在能力 seam 笔记中：面向模型的存储栈不得与 GUI 浏览耦合，OS 展示事实也不是存储原语。
- **保留延迟符号链接探测，截断后对条目重排。** 落选：保留集合将不再是有序头部的真值（名称靠前的指向文件的符号链接可能把真实目录挤出被截断的层级），悄悄破坏 `truncated`「有序尾部缺失」的语义。

## 后果

- 协议 schema（`directoryEntrySchema`）要求 `kind`；客户端线上类型源自 apiproxy 契约，所有消费方从单一来源获得该字段。
- 指向文件的符号链接现在在流式阶段付出一次 `stat`，而不是截断之后；符号链接密集的层级为每个链接付出一次竞速探测，断链则完全不进入窗口。
- 保留头部即该层级精确的有序头部，`truncated` 对合并列举保持「有序尾部缺失」的语义。
- 首个消费方：用户本地的 `dsh-file-explorer` GUI 插件（junction 交付、profile patch 行），它经 `ctx.workspaces.listDirectory(path, signal, { includeFiles: true })` 渲染带文件的工作区目录树。
