# 翱翔教务功能加强

基于 [翱翔教务功能加强](https://greasyfork.org/zh-CN/scripts/524099-%E7%BF%B1%E7%BF%94%E6%95%99%E5%8A%A1%E5%8A%9F%E8%83%BD%E5%8A%A0%E5%BC%BA) 油猴脚本二次开发，**非原作者**。

## 新增功能

- **GPA 预测**：为未出分课程设定预估绩点，计算预测总 GPA

## 使用方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 新建脚本，复制 `main.user.js` 中的内容保存即可


## 开发者

```bash
# 安装依赖
npm install

# 运行测试
npm test
```

## 目录结构

```
nwpu-edu-plus/
├── main.user.js      # 主脚本
├── package.json      # 项目配置
├── tests/           # 测试
└── README.md
```

## 分支说明

- `main` 分支：开发分支，包含自定义功能
- `official` 分支：同步官方代码，会定期更新
