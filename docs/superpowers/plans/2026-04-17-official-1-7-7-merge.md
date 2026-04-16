# Official 1.7.7 合并实施计划

> **给 agentic workers:** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行。所有步骤使用 checkbox 语法追踪。

**目标:** 将 official `v1.7.7` 的同步和教师搜索修复合入 `main`，同时保留非官方标识、GPA 预测和 Jest 测试体系。

**架构:** 以 `main` 为基底做定向移植，不整体替换 `main.user.js`。每个行为切片先补失败测试，再做最小实现，最后在绿灯状态下整理命名和重复逻辑。

**技术栈:** 油猴 userscript、原生 DOM API、Jest、Node `vm` 测试沙箱。

---

## 文件结构

- 修改 `main.user.js`：更新元信息版本，移植 official `v1.7.7` 的开课查询同步、后台同步和教师搜索行为，保留 GPA 预测。
- 修改 `tests/mainUserScript.runtime.test.js`：新增 runtime 层行为测试，包括元信息、教师搜索事件、`LessonSearchEnhancer`、后台同步。
- 修改 `tests/routeDispatch.test.js`：必要时补充路由级教师搜索断言。
- 修改 `tests/setup.js`：只在测试需要时补足 mock DOM 的 `children`、`dispatchEvent`、`reload`、`postMessage` 等最小能力。
- 保持 `tests/gpaEstimate.test.js`、`tests/gpaAnalysis.test.js` 作为 GPA 回归网，不为合并重写。

## 任务 1：元信息升级并保留非官方标识

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 的 `describe('main.user.js runtime exports', ...)` 内靠前位置加入：

```js
test('脚本元信息保持非官方名称并升级到 official 1.7.7', () => {
    const source = require('fs').readFileSync(SCRIPT_PATH, 'utf-8');

    expect(source).toContain('// @name         翱翔教务功能加强(非官方)');
    expect(source).toContain('// @version      1.7.7');
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "脚本元信息保持非官方名称"
```

预期：失败，错误信息包含 `Expected substring: "// @version      1.7.7"`，因为当前版本仍是 `1.7.6`。

- [ ] **步骤 3：写最小实现**

在 `main.user.js` 顶部只改版本号：

```js
// @name         翱翔教务功能加强(非官方)
// @namespace    http://tampermonkey.net/
// @version      1.7.7
```

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "脚本元信息保持非官方名称"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "test: lock userscript metadata for official 1.7.7 fork"
```

## 任务 2：教师主页搜索派发表单事件

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `tests/routeDispatch.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 的 `trySubmitQueuedTeacherSearch 在表单就绪后填写并提交` 测试中，创建 input 后补充事件 spy：

```js
const input = createElement('input', { id: 'sea' });
const dispatchedEvents = [];
input.dispatchEvent = jest.fn((event) => {
    dispatchedEvents.push(event.type);
    return true;
});
```

并在已有断言后加入：

```js
expect(dispatchedEvents).toEqual(['input', 'change']);
expect(input.dispatchEvent).toHaveBeenCalledTimes(2);
```

在 `tests/routeDispatch.test.js` 的 `teacher 搜索页慢加载时应在表单真正提交后才清除队列` 测试中同样给 input 添加：

```js
const dispatchedEvents = [];
input.dispatchEvent = jest.fn((event) => {
    dispatchedEvents.push(event.type);
    return true;
});
```

并在 `expect(input.value).toBe('张三');` 后加入：

```js
expect(dispatchedEvents).toEqual(['input', 'change']);
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js tests/routeDispatch.test.js -t "teacher|trySubmitQueuedTeacherSearch"
```

预期：失败，事件数组为空，因为当前实现只赋值并点击按钮。

- [ ] **步骤 3：写最小实现**

更新 `main.user.js` 的 `trySubmitQueuedTeacherSearch`：

```js
function trySubmitQueuedTeacherSearch(searchName) {
    const config = getTeacherSearchConfig();
    const input = document.getElementById('sea');
    const button = document.querySelector('.dyym2_btn');
    if (!input || !button) return false;

    input.value = searchName;
    if (typeof input.dispatchEvent === 'function') {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    button.click();
    GM_setValue(config.storageKey, '');
    return true;
}
```

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js tests/routeDispatch.test.js -t "teacher|trySubmitQueuedTeacherSearch"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js tests/routeDispatch.test.js
git commit -m "fix: dispatch events for queued teacher search"
```

## 任务 3：让开课查询同步模块可测试

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 的第一个导出测试中加入：

```js
expect(api.LessonSearchEnhancer).toBeDefined();
expect(api.LessonSearchEnhancer.injectControlPanel).toEqual(expect.any(Function));
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "测试模式会暴露核心 runtime API"
```

预期：失败，`api.LessonSearchEnhancer` 为 `undefined`。

- [ ] **步骤 3：写最小实现**

在 `main.user.js` 的 `exposeTestExports()` 中加入：

```js
LessonSearchEnhancer,
```

放在 `TextbookInfoModule` 附近，保持模块导出分组清晰。

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "测试模式会暴露核心 runtime API"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "test: expose lesson search enhancer in test mode"
```

## 任务 4：开课查询控制面板增加学期下拉框

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试：

```js
test('LessonSearchEnhancer 控制面板包含学期选择器和选定学期同步按钮', () => {
    const { api, env } = loadRuntime();
    const enhancer = api.LessonSearchEnhancer;

    enhancer.injectControlPanel();

    const semesterSelect = env.document.getElementById('gm-sync-semester');
    const syncButton = env.document.getElementById('gm-btn-sync-start');

    expect(semesterSelect).toBeDefined();
    expect(semesterSelect.innerHTML).toContain('加载学期列表中');
    expect(syncButton.innerHTML).toContain('存储选定学期课程信息');
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "控制面板包含学期选择器"
```

预期：失败，找不到 `gm-sync-semester`。

- [ ] **步骤 3：写最小实现**

更新 `LessonSearchEnhancer.injectControlPanel()` 的面板 HTML：

```js
<select id="gm-sync-semester" style="width:100%; padding:6px; margin-bottom:10px; border-radius:4px; border:1px solid #ccc; font-size:14px; outline:none; cursor:pointer;">
    <option value="">加载学期列表中...</option>
</select>
<button id="gm-btn-sync-start" style="width:100%; padding:8px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; transition: background 0.2s;">存储选定学期课程信息</button>
```

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "控制面板包含学期选择器"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "feat: add semester selector to lesson sync panel"
```

## 任务 5：填充并同步开课查询学期选项

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试：

```js
test('LessonSearchEnhancer 会从 selectize 数据填充学期下拉框并按新到旧排序', () => {
    const select = createElement('select', { id: 'semester' });
    select.selectize = {
        options: {
            old: { value: '202301', text: '2023-2024-1' },
            latest: { value: '202402', text: '2024-2025-2' },
        },
    };
    const { api, env } = loadRuntime({ envOptions: { elements: [select] } });
    const enhancer = api.LessonSearchEnhancer;

    enhancer.injectControlPanel();
    const semesterSelect = env.document.getElementById('gm-sync-semester');

    enhancer.populateSemesterSelect();

    expect(semesterSelect.innerHTML).toContain('value="202402"');
    expect(semesterSelect.innerHTML.indexOf('2024-2025-2')).toBeLessThan(
        semesterSelect.innerHTML.indexOf('2023-2024-1')
    );
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "selectize 数据填充学期"
```

预期：失败，`populateSemesterSelect` 不存在。

- [ ] **步骤 3：写最小实现**

在 `LessonSearchEnhancer` 中新增方法：

```js
getSemesterOptions() {
    let extractedOptions = [];
    try {
        const selectEl = document.getElementById('semester');
        if (selectEl && selectEl.selectize && selectEl.selectize.options) {
            extractedOptions = Object.values(selectEl.selectize.options)
                .map(o => ({ value: o.value, text: o.text || o.nameZh }));
        } else if (typeof unsafeWindow !== 'undefined' && unsafeWindow.$) {
            const jqEl = unsafeWindow.$('#semester');
            if (jqEl.length > 0 && jqEl[0].selectize && jqEl[0].selectize.options) {
                extractedOptions = Object.values(jqEl[0].selectize.options)
                    .map(o => ({ value: o.value, text: o.text || o.nameZh }));
            }
        }
    } catch (e) {}

    if (extractedOptions.length === 0) {
        document.querySelectorAll('.selectize-dropdown.semester .option').forEach(opt => {
            const value = opt.getAttribute('data-value');
            const text = opt.innerText.trim();
            if (value && text) extractedOptions.push({ value, text });
        });
    }

    const seenValues = new Set();
    return extractedOptions
        .filter(opt => opt.value && opt.text && opt.text !== 'undefined')
        .filter(opt => {
            if (seenValues.has(opt.value)) return false;
            seenValues.add(opt.value);
            return true;
        })
        .sort((a, b) => parseInt(b.value, 10) - parseInt(a.value, 10));
},

populateSemesterSelect() {
    const gmSelect = document.getElementById('gm-sync-semester');
    if (!gmSelect) return false;

    const options = this.getSemesterOptions();
    if (options.length === 0) return false;

    gmSelect.innerHTML = options
        .map(opt => `<option value="${opt.value}">${opt.text}</option>`)
        .join('');
    this.syncSemesterSelect();
    return true;
},

syncSemesterSelect() {
    const originalSemester = document.querySelector('.selectize-control.semester .item');
    const gmSelect = document.getElementById('gm-sync-semester');
    if (!originalSemester || !gmSelect || document.activeElement === gmSelect || gmSelect.options.length <= 1) return;

    const semesterName = originalSemester.innerText.trim();
    Array.from(gmSelect.options).forEach(option => {
        if (option.text === semesterName) option.selected = true;
    });
},
```

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "selectize 数据填充学期"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "feat: populate lesson sync semesters"
```

## 任务 6：开课查询初始化等待学期选项并触发自动同步

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试：

```js
test('LessonSearchEnhancer 初始化会轮询填充学期并在自动标记存在时启动同步', () => {
    const pageConfig = createElement('div', { className: 'page-config' });
    const table = createElement('table', { id: 'table' });
    const { api, env } = loadRuntime({
        envOptions: {
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search',
            elements: [pageConfig, table],
        },
    });
    const enhancer = api.LessonSearchEnhancer;
    const startSpy = jest.spyOn(enhancer, 'startSyncProcess').mockResolvedValue(undefined);
    jest.spyOn(enhancer, 'populateSemesterSelect').mockReturnValue(true);

    global.sessionStorage = {
        getItem: jest.fn(() => 'true'),
        removeItem: jest.fn(),
    };

    enhancer.init();

    const intervalId = [...env.intervals.keys()][0];
    expect(intervalId).toBeDefined();
    env.intervals.get(intervalId)();

    expect(global.sessionStorage.removeItem).toHaveBeenCalledWith('nwpu_course_sync_trigger');
    expect(startSpy).toHaveBeenCalledWith(true);
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "初始化会轮询填充学期"
```

预期：失败，当前 `init()` 不轮询 `populateSemesterSelect`。

- [ ] **步骤 3：写最小实现**

在 `LessonSearchEnhancer.init()` 中，`injectControlPanel()` 和 `renderHistoryTags()` 后增加：

```js
let retryCount = 0;
const populateTimer = setInterval(() => {
    retryCount++;
    const gmSelect = document.getElementById('gm-sync-semester');
    if (!gmSelect) {
        clearInterval(populateTimer);
        return;
    }

    if (this.populateSemesterSelect()) {
        clearInterval(populateTimer);
        if (sessionStorage.getItem('nwpu_course_sync_trigger') === 'true') {
            sessionStorage.removeItem('nwpu_course_sync_trigger');
            setTimeout(() => { this.startSyncProcess(true); }, 500);
        }
    } else if (retryCount > 40) {
        gmSelect.innerHTML = '<option value="">加载失败，请刷新页面重试</option>';
        clearInterval(populateTimer);
    }
}, 500);
```

同时移除旧的自动同步逻辑中“发现 `td.dataTables_empty` 就继续等待 init”的分支，避免空学期永远不启动自动同步。

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "初始化会轮询填充学期"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "feat: initialize lesson sync semester selector"
```

## 任务 7：开课查询手动同步只抓选定学期

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试：

```js
test('LessonSearchEnhancer 手动同步会切换到用户选定学期并在遮罩显示锁定学期', async () => {
    const gmSelect = createElement('select', { id: 'gm-sync-semester', value: '202402' });
    gmSelect.options = [{ value: '202402', text: '2024-2025-2', selected: true }];
    gmSelect.selectedIndex = 0;
    const currentItem = createElement('div', { className: 'item', textContent: '2023-2024-1' });
    currentItem.innerText = '2023-2024-1';
    const semesterInput = createElement('div', { className: 'selectize-input' });
    const option = createElement('div', { className: 'option', 'data-value': '202402', textContent: '2024-2025-2' });
    const pageSize = createElement('button', { className: 'dropdown-toggle', textContent: '1000' });
    const pageConfig = createElement('div', { className: 'page-config' }, [pageSize]);
    const table = createElement('table', { id: 'table' });

    const { api, env } = loadRuntime({ envOptions: { elements: [gmSelect, currentItem, semesterInput, option, pageConfig, table] } });
    const enhancer = api.LessonSearchEnhancer;
    jest.spyOn(enhancer, 'scrapeCurrentPage').mockReturnValue(0);
    global.confirm = jest.fn(() => true);
    global.alert = jest.fn();

    await enhancer.startSyncProcess(false);

    const overlay = env.document.getElementById('gm-sync-overlay');
    expect(overlay.innerHTML).toContain('锁定抓取学期: 2024-2025-2');
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "手动同步会切换"
```

预期：失败，当前 `showOverlay()` 不显示学期，`startSyncProcess(false)` 也不读取 `gm-sync-semester`。

- [ ] **步骤 3：写最小实现**

更新 `LessonSearchEnhancer.showOverlay`：

```js
showOverlay(semesterName = '当前学期') {
    const div = document.createElement('div');
    div.id = 'gm-sync-overlay';
    div.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:100000; color:white; display:flex; flex-direction:column; align-items:center; justify-content:center;';
    div.innerHTML = `
        <div style="font-size:24px; font-weight:bold; margin-bottom:15px;">正在同步课程数据...</div>
        <div id="gm-overlay-target-sem" style="font-size:18px; margin-bottom:10px; color:#ffeb3b;">锁定抓取学期: ${semesterName}</div>
        <div id="gm-overlay-status" style="font-size:16px; margin-bottom:10px; color:#ddd;">正在初始化...</div>
        <div style="font-size:18px;">已抓取: <span id="gm-sync-count" style="color:#4facfe; font-weight:bold;">0</span> 条</div>
        <div style="margin-top:30px; color:#aaa; font-size:14px;">请勿关闭页面，程序正在自动操作</div>
    `;
    document.body.appendChild(div);
    return div;
},
```

在 `startSyncProcess(isAuto)` 开头读取手动学期：

```js
const gmSelect = document.getElementById('gm-sync-semester');
if (!isAuto && (!gmSelect || gmSelect.options.length === 0 || !gmSelect.value)) {
    alert("学期列表仍在加载中或加载失败，请稍等后再试。");
    return;
}

let targetSemesterName = '当前学期';
let targetSemesterValue = '';
let overlay = null;

if (!isAuto) {
    targetSemesterName = gmSelect.options[gmSelect.selectedIndex].text;
    targetSemesterValue = gmSelect.value;
    if (!confirm(`即将自动操作并开始抓取【${targetSemesterName}】的数据。\n过程可能需要几十秒，请勿关闭页面。`)) return;
    overlay = this.showOverlay(targetSemesterName);
}
```

再抽出并调用 `selectSemesterByValue(targetSemesterValue)`，实现通过 `.selectize-control.semester .selectize-input` 打开下拉，点击 `.option[data-value="..."]`。

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "手动同步会切换"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "feat: sync selected lesson semester"
```

## 任务 8：开课查询自动同步跳过空学期

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试，直接覆盖新的 helper：

```js
test('LessonSearchEnhancer 自动同步会选择第一个非空学期', async () => {
    const first = { value: '202402', text: '2024-2025-2' };
    const second = { value: '202301', text: '2023-2024-1' };
    const { api } = loadRuntime();
    const enhancer = api.LessonSearchEnhancer;

    jest.spyOn(enhancer, 'getSemesterOptions').mockReturnValue([first, second]);
    jest.spyOn(enhancer, 'selectSemesterByValue').mockResolvedValue(undefined);
    jest.spyOn(enhancer, 'isCurrentSemesterEmpty')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

    const result = await enhancer.findLatestSemesterWithData();

    expect(result).toEqual(second);
    expect(enhancer.selectSemesterByValue).toHaveBeenCalledWith('202402');
    expect(enhancer.selectSemesterByValue).toHaveBeenCalledWith('202301');
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "第一个非空学期"
```

预期：失败，`findLatestSemesterWithData` 不存在。

- [ ] **步骤 3：写最小实现**

在 `LessonSearchEnhancer` 中新增：

```js
isCurrentSemesterEmpty() {
    const emptyNode = document.querySelector(this.CONFIG.LOADER);
    return !!(emptyNode && emptyNode.innerText.includes('无数据'));
},

async findLatestSemesterWithData() {
    const options = this.getSemesterOptions();
    for (const option of options) {
        this.updateOverlayStatus(`正在检测: ${option.text}...`);
        await this.selectSemesterByValue(option.value);
        if (this.isCurrentSemesterEmpty()) {
            Logger.log("2.5", `学期 ${option.text} 为空，跳过`);
            continue;
        }
        return option;
    }
    return null;
},
```

并让 `startSyncProcess(true)` 使用该 helper，找不到时提示并移除遮罩。

- [ ] **步骤 4：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "第一个非空学期"
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js
git commit -m "feat: skip empty lesson sync semesters"
```

## 任务 9：后台同步跳过空学期和空行

**文件:**
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `tests/setup.js`
- 修改: `main.user.js`

- [ ] **步骤 1：写失败测试**

在 `tests/mainUserScript.runtime.test.js` 新增测试：

```js
test('BackgroundSyncSystem worker 跳过 DataTables 空行', () => {
    const emptyRow = createElement('tr', {}, [
        createElement('td', { className: 'dataTables_empty', textContent: '无数据' }),
    ]);
    const validRow = createElement('tr', {}, [
        createElement('td', {}, [createElement('input', { name: 'model_id', value: 'lesson-1' })]),
        createElement('td', { className: 'lesson-code', textContent: 'U01M1001' }),
        createElement('td', { className: 'course-name', textContent: '高等数学' }),
        createElement('td', { textContent: '4' }),
        createElement('td', { className: 'course-teacher', textContent: '张老师' }),
        createElement('td', { className: 'course-datetime-place', textContent: '周一; 教室A' }),
        createElement('td', {}, [createElement('span', { 'data-original-title': '实际/上限人数', textContent: '10/30' })]),
    ]);
    const tbody = createElement('tbody', {}, [emptyRow, validRow]);
    const table = createElement('table', { id: 'table' }, [tbody]);
    const pageSize = createElement('button', { className: 'dropdown-toggle', textContent: '1000' });
    const pageConfig = createElement('div', { className: 'page-config' }, [pageSize]);

    const { api, env, runNextTimeout } = loadRuntime({
        envOptions: {
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search',
            elements: [pageConfig, table],
        },
    });
    env.window.top.postMessage = jest.fn();

    api.BackgroundSyncSystem.startWorker();
    runNextTimeout();

    const stored = JSON.parse(env.gmStorage[api.CONSTANTS.BACKGROUND_SYNC_KEY]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'lesson-1', code: 'U01M1001', name: '高等数学' });
});
```

- [ ] **步骤 2：运行测试确认红灯或测试沙箱缺口**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "worker 跳过 DataTables 空行"
```

预期：先失败。若失败原因是 mock DOM 缺少 `children`、`name` 属性选择器或 `innerText`，先补 `tests/setup.js` 的最小 DOM 能力，再重新运行直到失败原因指向生产行为。

- [ ] **步骤 3：补测试沙箱的最小 DOM 能力**

在 `tests/setup.js` 的 `createElementEx` 返回对象中确保包含：

```js
innerText: attrs.innerText || attrs.textContent || '',
children: childNodes,
disabled: !!attrs.disabled,
```

在 `getAttribute(name)` 中确保普通属性可读取：

```js
if (name in this.attributes) return this.attributes[name];
```

如果需要点击后重载，给 `locationObj` 增加：

```js
reload: jest.fn(),
```

- [ ] **步骤 4：写最小生产实现**

在 `BackgroundSyncSystem.startWorker()` 内的 `waitForLoading` 修改为空学期可退出：

```js
while (document.querySelector('td.dataTables_empty') &&
        !document.querySelector('td.dataTables_empty').innerText.includes('无数据') &&
        limit < 200) {
    await sleep(100); limit++;
}
```

在 `scrapeCurrentPage` 的行循环开头加入：

```js
if (row.querySelector('td.dataTables_empty')) return;
```

再把学期选择逻辑改为遍历 `.selectize-dropdown-content .option`，跳过 `无数据` 学期，找不到有效学期时抛出：

```js
if (!foundValidSemester) {
    throw new Error("遍历了所有学期均未找到排课数据");
}
```

- [ ] **步骤 5：运行测试确认绿灯**

运行：

```bash
npm test -- --runInBand tests/mainUserScript.runtime.test.js -t "worker 跳过 DataTables 空行"
```

预期：通过。

- [ ] **步骤 6：提交**

```bash
git add main.user.js tests/mainUserScript.runtime.test.js tests/setup.js
git commit -m "fix: skip empty semesters in background sync"
```

## 任务 10：全量回归和 GPA 预测保护

**文件:**
- 修改: `main.user.js`
- 修改: `tests/mainUserScript.runtime.test.js`
- 修改: `tests/routeDispatch.test.js`
- 修改: `tests/setup.js`

- [ ] **步骤 1：运行语法检查**

运行：

```bash
node --check main.user.js
```

预期：无输出，退出码为 `0`。

- [ ] **步骤 2：运行聚焦 GPA 测试**

运行：

```bash
npm test -- --runInBand tests/gpaEstimate.test.js tests/gpaAnalysis.test.js
```

预期：全部通过，证明 GPA 预测和 GPA 分析未被合并破坏。

- [ ] **步骤 3：运行全量测试**

运行：

```bash
npm test -- --runInBand
```

预期：所有测试套件通过。

- [ ] **步骤 4：检查 official 行为和 fork 保留项**

运行：

```bash
rg -n "@name|@version|GPA预测|gm-sync-semester|findLatestSemesterWithData|trySubmitQueuedTeacherSearch" main.user.js
```

预期输出包含：

```text
// @name         翱翔教务功能加强(非官方)
// @version      1.7.7
GPA预测
gm-sync-semester
findLatestSemesterWithData
trySubmitQueuedTeacherSearch
```

- [ ] **步骤 5：查看工作区状态**

运行：

```bash
git status --short
```

预期：只显示本次任务相关文件，或为空。

- [ ] **步骤 6：提交最终回归修正**

如果步骤 1 到 5 发现并修复了遗漏，提交：

```bash
git add main.user.js tests/mainUserScript.runtime.test.js tests/routeDispatch.test.js tests/setup.js
git commit -m "test: verify official 1.7.7 merge regression"
```

如果没有额外修正，不需要创建空提交。

## 计划自检

- 设计文档中的 official `1.7.7` 行为都有对应任务。
- GPA 预测没有被移除或重写，只通过回归测试保护。
- 每个生产代码变更前都有红灯测试步骤。
- 每个任务都有聚焦测试、绿灯确认和提交步骤。
- 最终验证包含 `node --check main.user.js` 和 `npm test -- --runInBand`。
