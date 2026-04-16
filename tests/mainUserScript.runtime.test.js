const path = require('path');
const { createMockEnv, createElement } = require('./setup');

const SCRIPT_PATH = path.join(__dirname, '..', 'main.user.js');

let restoreGlobals = null;

function installRuntimeGlobals(env, overrides = {}) {
    const previousValues = new Map();
    const assign = (key, value) => {
        if (!previousValues.has(key)) {
            previousValues.set(key, global[key]);
        }
        global[key] = value;
    };

    const ElementClass = overrides.Element || class Element {};
    const HTMLImageElementClass = overrides.HTMLImageElement || class HTMLImageElement extends ElementClass {};
    const unsafeWindow = overrides.unsafeWindow || { XMLHttpRequest: function XMLHttpRequest() {} };
    unsafeWindow.XMLHttpRequest.prototype = unsafeWindow.XMLHttpRequest.prototype || {};
    unsafeWindow.XMLHttpRequest.prototype.open ||= jest.fn();
    unsafeWindow.XMLHttpRequest.prototype.send ||= jest.fn();
    unsafeWindow.XMLHttpRequest.prototype.addEventListener ||= jest.fn();

    const baseGlobals = {
        ...env.window,
        ...overrides,
        __NWPU_EDU_PLUS_TEST__: true,
        __NWPU_EDU_PLUS_TEST_SKIP_BOOTSTRAP__: true,
        document: env.document,
        location: overrides.location || env.window.location,
        fetch: overrides.fetch || jest.fn(),
        DOMParser: overrides.DOMParser || class DOMParser {
            parseFromString() {
                return {
                    querySelector: () => null,
                    querySelectorAll: () => [],
                };
            }
        },
        unsafeWindow,
        Element: ElementClass,
        HTMLImageElement: HTMLImageElementClass,
    };

    Object.entries(baseGlobals).forEach(([key, value]) => assign(key, value));
    assign('window', global);
    assign('self', overrides.self || global);
    assign('top', overrides.top || global);
    assign('globalThis', global);

    return () => {
        delete global.__NWPU_EDU_PLUS_TEST_EXPORTS;
        for (const [key, value] of previousValues.entries()) {
            if (typeof value === 'undefined') {
                delete global[key];
            } else {
                global[key] = value;
            }
        }
    };
}

function loadRuntime({ envOptions = {}, globalOverrides = {}, manualTimeouts = true } = {}) {
    jest.resetModules();
    if (restoreGlobals) {
        restoreGlobals();
    }
    delete global.__NWPU_EDU_PLUS_TEST_EXPORTS;

    const env = createMockEnv(envOptions);
    const timeouts = new Map();
    let nextTimeoutId = 1;

    if (manualTimeouts) {
        env.window.setTimeout = jest.fn((fn, delay) => {
            const id = nextTimeoutId++;
            timeouts.set(id, { fn, delay });
            return id;
        });
        env.window.clearTimeout = jest.fn((id) => {
            timeouts.delete(id);
        });
    }

    restoreGlobals = installRuntimeGlobals(env, globalOverrides);
    require(SCRIPT_PATH);

    const api = global.__NWPU_EDU_PLUS_TEST_EXPORTS;
    expect(api).toBeDefined();

    return {
        env,
        api,
        timeouts,
        runTimeout(id) {
            const job = timeouts.get(id);
            expect(job).toBeDefined();
            timeouts.delete(id);
            job.fn();
        },
        runNextTimeout() {
            const iterator = timeouts.keys();
            const next = iterator.next();
            if (next.done) {
                throw new Error('No pending timeout');
            }
            this.runTimeout(next.value);
            return next.value;
        },
    };
}

function buildGpaResultPanel() {
    return createElement('div', { id: 'gm-estimate-result', style: { display: 'none' } }, [
        createElement('div', { id: 'gm-result-a' }),
        createElement('div', { id: 'gm-result-b' }),
    ]);
}

function buildGpaCourseRow({ code, credits, graded = false, gpa = '', custom = '' }) {
    const cells = [
        createElement('td', {}, [
            createElement('input', { 'data-field': 'credits', value: String(credits) }),
        ]),
        createElement(
            'td',
            {},
            graded
                ? [createElement('input', { 'data-field': 'gpa', 'data-graded': 'true', value: String(gpa) })]
                : [
                    createElement('select', { 'data-field': 'gpa', value: String(gpa) }),
                    createElement('input', { 'data-field': 'gpa-custom', value: String(custom) }),
                ]
        ),
    ];

    return createElement('tr', { 'data-code': code }, cells);
}

afterEach(() => {
    if (restoreGlobals) {
        restoreGlobals();
        restoreGlobals = null;
    }
    jest.restoreAllMocks();
    jest.resetModules();
    delete global.__NWPU_EDU_PLUS_TEST_EXPORTS;
});

describe('main.user.js runtime exports', () => {
    test('脚本元信息保持非官方名称并升级到 official 1.7.7', () => {
        const source = require('fs').readFileSync(SCRIPT_PATH, 'utf-8');
        const headerStart = source.indexOf('// ==UserScript==');
        const headerEnd = source.indexOf('// ==/UserScript==');

        expect(headerStart).toBeGreaterThanOrEqual(0);
        expect(headerEnd).toBeGreaterThan(headerStart);

        const headerLines = source
            .slice(headerStart, headerEnd)
            .split(/\r?\n/)
            .map((line) => line.trimEnd());
        const nameLines = headerLines.filter((line) => line.startsWith('// @name '));
        const versionLines = headerLines.filter((line) => line.startsWith('// @version '));

        expect(nameLines).toEqual(['// @name         翱翔教务功能加强(非官方)']);
        expect(versionLines).toEqual(['// @version      1.7.7']);
    });

    test('测试模式会暴露核心 runtime API', () => {
        const { api } = loadRuntime();

        expect(api.applyTestOverrides).toEqual(expect.any(Function));
        expect(api.LessonSearchEnhancer).toBeDefined();
        expect(api.LessonSearchEnhancer.injectControlPanel).toEqual(expect.any(Function));
        expect(api.initializeCourseTablePage).toEqual(expect.any(Function));
        expect(api.initializeTeacherSearchAutoSubmit).toEqual(expect.any(Function));
        expect(api.runMainFeatures).toEqual(expect.any(Function));
    });

    test('consumeCourseTableAutoFetchFlag 只消费有效自动跳转标记', () => {
        const { api, env } = loadRuntime();
        const now = Date.now();

        env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY] = now;
        expect(api.consumeCourseTableAutoFetchFlag(now)).toBe(true);
        expect(env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY]).toBe(0);

        env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY] = now - api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_WINDOW_MS - 1;
        expect(api.consumeCourseTableAutoFetchFlag(now)).toBe(false);
        expect(env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY]).toBe(now - api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_WINDOW_MS - 1);
    });

    test('queueTeacherSearch 会写入姓名并打开教师搜索页', () => {
        const open = jest.fn();
        const { api, env } = loadRuntime({
            globalOverrides: { open },
        });

        api.queueTeacherSearch('王老师');

        expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('王老师');
        expect(open).toHaveBeenCalledWith(api.CONSTANTS.PAGE_TEACHER_SEARCH, '_blank');
    });

    test('trySubmitQueuedTeacherSearch 在表单就绪后填写并提交', () => {
        const input = createElement('input', { id: 'sea' });
        const observedEvents = [];
        input.addEventListener('input', () => observedEvents.push(['input', input.value]));
        input.addEventListener('change', () => observedEvents.push(['change', input.value]));
        input.dispatchEvent = jest.fn((event) => {
            (input._listeners[event.type] || []).forEach((handler) => handler(event));
            return true;
        });
        const button = createElement('button', { className: 'dyym2_btn' });
        const clickSpy = jest.fn(() => {
            expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('李老师');
        });
        button.addEventListener('click', clickSpy);

        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://teacher.nwpu.edu.cn/search/syss/.html',
                elements: [input, button],
            },
        });
        env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY] = '李老师';

        expect(api.trySubmitQueuedTeacherSearch('李老师')).toBe(true);
        expect(input.value).toBe('李老师');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(observedEvents).toEqual([
            ['input', '李老师'],
            ['change', '李老师'],
        ]);
        expect(input.dispatchEvent).toHaveBeenCalledTimes(2);
        expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('');
    });

    test('initializeTeacherSearchAutoSubmit 在慢加载时保留队列，直到真正提交才清空', () => {
        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://teacher.nwpu.edu.cn/search/syss/.html',
            },
        });

        env.window.GM_setValue(api.CONSTANTS.TEACHER_SEARCH_NAME_KEY, '张老师');
        api.initializeTeacherSearchAutoSubmit();

        const intervalId = [...env.intervals.keys()][0];
        expect(intervalId).toBeDefined();

        env.intervals.get(intervalId)();
        expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('张老师');

        const input = createElement('input', { id: 'sea' });
        const button = createElement('button', { className: 'dyym2_btn' });
        const clickSpy = jest.fn();
        button.addEventListener('click', clickSpy);
        env.document.body.appendChild(input);
        env.document.body.appendChild(button);

        env.intervals.get(intervalId)();

        expect(input.value).toBe('张老师');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('');
        expect(env.intervals.has(intervalId)).toBe(false);
    });

    test('requestTextWithFallback 会在前序失败后继续尝试下一个地址', () => {
        const requests = [];
        const { api } = loadRuntime({
            globalOverrides: {
                GM_xmlhttpRequest: jest.fn((options) => {
                    requests.push(options);
                }),
            },
        });

        const onSuccess = jest.fn();
        api.requestTextWithFallback(
            ['https://a.example', 'https://b.example'],
            (res) => res.status === 200,
            { onSuccess }
        );

        expect(requests).toHaveLength(1);
        requests[0].onerror();
        expect(requests).toHaveLength(2);
        requests[1].onload({ status: 200 });
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('buildGreasyForkFallbackUrls 会生成完整的三段回退链', () => {
        const { api } = loadRuntime();
        expect(api.buildGreasyForkFallbackUrls('https://example.com/a.user.js')).toEqual([
            'https://example.com/a.user.js',
            'https://api.codetabs.com/v1/proxy?quest=https%3A%2F%2Fexample.com%2Fa.user.js',
            'https://api.allorigins.win/raw?url=https%3A%2F%2Fexample.com%2Fa.user.js',
        ]);
    });

    test('downloadUserscriptWithFallback 会在脚本校验失败后继续尝试下一跳', () => {
        const requests = [];
        const { api } = loadRuntime({
            globalOverrides: {
                GM_xmlhttpRequest: jest.fn((options) => {
                    requests.push(options);
                }),
            },
        });

        const onSuccess = jest.fn();
        api.downloadUserscriptWithFallback('https://example.com/a.user.js', { onSuccess });

        expect(requests).toHaveLength(1);
        requests[0].onerror();
        expect(requests).toHaveLength(2);
        requests[1].onerror();
        expect(requests).toHaveLength(3);
        requests[2].onload({ status: 200, responseText: '// ==UserScript==\n// ==/UserScript==' });
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('isTeacherSite / isTeacherSearchPage / getTeacherSearchConfig 返回预期结果', () => {
        const { api } = loadRuntime({
            envOptions: {
                url: 'https://teacher.nwpu.edu.cn/search/syss/.html',
            },
        });

        expect(api.isTeacherSite()).toBe(true);
        expect(api.isTeacherSearchPage()).toBe(true);
        expect(api.getTeacherSearchConfig()).toMatchObject({
            pageUrl: api.CONSTANTS.PAGE_TEACHER_SEARCH,
            storageKey: api.CONSTANTS.TEACHER_SEARCH_NAME_KEY,
        });
    });

    test('getPassStatus 和 precomputeAllWeightedScores 会输出可读结果', () => {
        const { api } = loadRuntime();

        expect(api.getPassStatus('优秀')).toContain('通过');
        expect(api.getPassStatus('59')).toContain('不通过');

        const weighted = api.precomputeAllWeightedScores([
            { 学期: '2023-2024-1', 学分: '3', 成绩: '90' },
            { 学期: '2023-2024-1', 学分: '2', 成绩: '80' },
            { 学期: '2023-2024-2', 学分: '1', 成绩: '100' },
        ]);

        expect(weighted['2023-2024-1'].weightedScore).toBe('86.0000');
        expect(weighted.全部.weightedScore).toBe('88.3333');
    });

    test('navigateToCourseTablePage 会优先点击菜单链接并写入自动获取标记', () => {
        const menuLink = createElement('a', {
            href: '/student/for-std/course-table',
            'data-text': '我的课表',
        });
        const clickSpy = jest.fn();
        menuLink.addEventListener('click', clickSpy);

        const overlay = createElement('div', { className: 'gpa-report-overlay' });
        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/home',
                elements: [menuLink, overlay],
            },
        });

        api.navigateToCourseTablePage();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY]).toEqual(expect.any(Number));
        expect(overlay._removed).toBe(true);
    });

    test('initializeCourseTableCacheOnLoad 会安排课表缓存任务', () => {
        const { api, timeouts } = loadRuntime();
        const cacheSpy = jest.fn();
        api.applyTestOverrides({ cacheCourseTableData: cacheSpy });

        api.initializeCourseTableCacheOnLoad();

        expect(timeouts.size).toBe(1);
        const timeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(timeoutId).delay).toBe(api.CONSTANTS.COURSE_TABLE_CACHE_DELAY_MS);
        timeouts.get(timeoutId).fn();
        expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    test('initializeTeacherSitePage 在搜索页会自动提交排队教师名', () => {
        const input = createElement('input', { id: 'sea' });
        const button = createElement('button', { className: 'dyym2_btn' });
        const clickSpy = jest.fn();
        button.addEventListener('click', clickSpy);

        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://teacher.nwpu.edu.cn/search/syss/.html',
                elements: [input, button],
            },
        });

        env.window.GM_setValue(api.CONSTANTS.TEACHER_SEARCH_NAME_KEY, '刘老师');
        api.initializeTeacherSitePage();

        expect(input.value).toBe('刘老师');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.gmStorage[api.CONSTANTS.TEACHER_SEARCH_NAME_KEY]).toBe('');
    });

    test('initializeCourseTableSemesterWatcher 会在切换学期后重新缓存', () => {
        const semesterSelect = createElement('select', { id: 'semester-select' });
        const { api, timeouts, runTimeout } = loadRuntime({
            envOptions: {
                elements: [semesterSelect],
            },
        });
        const cacheSpy = jest.fn();
        api.applyTestOverrides({ cacheCourseTableData: cacheSpy });

        api.initializeCourseTableSemesterWatcher();

        const bindTimeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(bindTimeoutId).delay).toBe(api.CONSTANTS.COURSE_TABLE_SEMESTER_BIND_DELAY_MS);
        runTimeout(bindTimeoutId);

        const changeListener = semesterSelect._listeners.change[0];
        expect(changeListener).toEqual(expect.any(Function));
        changeListener();

        const refreshTimeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(refreshTimeoutId).delay).toBe(api.CONSTANTS.COURSE_TABLE_SEMESTER_CACHE_DELAY_MS);
        timeouts.get(refreshTimeoutId).fn();
        expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    test('startCourseTableLessonObserver 命中课程行后只处理一次', () => {
        let observerInstance = null;
        const lessonRow = createElement('tr', { className: 'lessonInfo' });
        const { api, timeouts } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
                elements: [lessonRow],
            },
            globalOverrides: {
                MutationObserver: class {
                    constructor(cb) {
                        this.cb = cb;
                        this.observe = jest.fn();
                        this.disconnect = jest.fn();
                        observerInstance = this;
                    }
                },
            },
        });
        const cacheSpy = jest.fn();
        const toastSpy = jest.fn();
        api.applyTestOverrides({
            cacheCourseTableData: cacheSpy,
            showAutoFetchSuccessToast: toastSpy,
        });

        api.startCourseTableLessonObserver(true);

        const startTimeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(startTimeoutId).delay).toBe(api.CONSTANTS.COURSE_TABLE_OBSERVER_START_DELAY_MS);
        timeouts.get(startTimeoutId).fn();

        observerInstance.cb([{ type: 'childList' }]);
        observerInstance.cb([{ type: 'childList' }]);

        expect(cacheSpy).toHaveBeenCalledTimes(1);
        expect(toastSpy).toHaveBeenCalledTimes(1);
        expect(observerInstance.disconnect).toHaveBeenCalled();
    });

    test('initializeCourseTableClickWatcher 命中相关按钮文本时会安排缓存', () => {
        const { api, env, timeouts } = loadRuntime();
        const cacheSpy = jest.fn();
        api.applyTestOverrides({ cacheCourseTableData: cacheSpy });

        api.initializeCourseTableClickWatcher();

        const clickListener = env.document.addEventListener.mock.calls.find(([eventName]) => eventName === 'click')[1];
        clickListener({
            target: createElement('button', { textContent: '全部课程' }),
        });

        const timeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(timeoutId).delay).toBe(api.CONSTANTS.COURSE_TABLE_CACHE_DELAY_MS);
        timeouts.get(timeoutId).fn();
        expect(cacheSpy).toHaveBeenCalledTimes(1);
    });

    test('initializeCourseTablePage 会组合自动获取、教材 UI 和悬浮菜单逻辑', () => {
        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
            },
        });
        const autoClickSpy = jest.fn();
        const createFloatingMenuSpy = jest.fn();
        const initUISpy = jest.fn();

        env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY] = Date.now();
        api.applyTestOverrides({
            autoClickAllCoursesAndScroll: autoClickSpy,
            createFloatingMenu: createFloatingMenuSpy,
            TextbookInfoModule: { initUI: initUISpy },
        });

        api.initializeCourseTablePage();

        expect(env.gmStorage[api.CONSTANTS.COURSE_TABLE_AUTO_FETCH_KEY]).toBe(0);
        expect(autoClickSpy).toHaveBeenCalledTimes(1);
        expect(initUISpy).toHaveBeenCalledTimes(1);
        expect(createFloatingMenuSpy).toHaveBeenCalledTimes(1);
    });

    test('runMainFeatures 在 teacher 非搜索页提前返回，不初始化 jwxt 首页', () => {
        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://teacher.nwpu.edu.cn/profile/12345',
            },
        });
        const homeSpy = jest.fn();
        const initControllerSpy = jest.fn();

        api.applyTestOverrides({
            initializeHomePageFeatures: homeSpy,
            BackgroundSyncSystem: { initController: initControllerSpy },
        });

        api.runMainFeatures();

        expect(homeSpy).not.toHaveBeenCalled();
        expect(initControllerSpy).not.toHaveBeenCalled();
        expect(env.document.addEventListener).not.toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('runMainFeatures 在 ecampus 首页会同步 token 并初始化首页能力', () => {
        const { api } = loadRuntime({
            envOptions: {
                url: 'https://ecampus.nwpu.edu.cn/main.html',
            },
        });
        const syncTokenSpy = jest.fn();
        const homeSpy = jest.fn();

        api.applyTestOverrides({
            PersonnelSearch: { syncToken: syncTokenSpy },
            initializeHomePageFeatures: homeSpy,
        });

        api.runMainFeatures();

        expect(syncTokenSpy).toHaveBeenCalledTimes(1);
        expect(homeSpy).toHaveBeenCalledTimes(1);
    });

    test('runMainFeatures 在 lesson-search 页面会初始化开课查询', () => {
        const { api } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search',
            },
        });
        const lessonSearchSpy = jest.fn();

        api.applyTestOverrides({
            initLessonSearchPage: lessonSearchSpy,
        });

        api.runMainFeatures();

        expect(lessonSearchSpy).toHaveBeenCalledTimes(1);
    });

    test('runMainFeatures 在 student-portrait 页面会初始化画像增强', () => {
        const { api } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/for-std/student-portrait',
            },
        });
        const portraitSpy = jest.fn();

        api.applyTestOverrides({
            enhancePortraitPage: portraitSpy,
        });

        api.runMainFeatures();

        expect(portraitSpy).toHaveBeenCalledTimes(1);
    });

    test('runMainFeatures 在 program 页面会初始化培养方案增强', () => {
        const { api } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/for-std/program/info/12345',
            },
        });
        const programSpy = jest.fn();

        api.applyTestOverrides({
            initProgramPageEnhancement: programSpy,
        });

        api.runMainFeatures();

        expect(programSpy).toHaveBeenCalledTimes(1);
    });

    test('runMainFeatures 在 evaluation 页面会挂载监听器和兜底执行', () => {
        const { api, env, timeouts } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/evaluation-student-frontend/index.html#/byTask',
            },
        });
        const evalSpy = jest.fn();

        api.applyTestOverrides({
            initEvaluationHelper: evalSpy,
        });

        api.runMainFeatures();

        expect(env.window.addEventListener).toHaveBeenCalledWith('load', evalSpy);
        expect(env.window.addEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
        const timeoutId = [...timeouts.keys()][0];
        expect(timeouts.get(timeoutId).delay).toBe(2000);
        timeouts.get(timeoutId).fn();
        expect(evalSpy).toHaveBeenCalledTimes(1);
    });

    test('calculatePredictedGPA 会生成本学期与总 GPA 结果', () => {
        const resultPanel = buildGpaResultPanel();
        const table = createElement('table', {}, [
            createElement('tbody', {}, [
                buildGpaCourseRow({ code: 'C1', credits: 4, graded: true, gpa: 3.7 }),
                buildGpaCourseRow({ code: 'C2', credits: 2, gpa: 'custom', custom: 3.9 }),
                buildGpaCourseRow({ code: 'C3', credits: 1, gpa: 3.0 }),
            ]),
        ]);
        const { api, env } = loadRuntime({
            envOptions: {
                elements: [resultPanel, table],
            },
        });

        api.calculatePredictedGPA(
            env.document.body,
            [
                { 学分: '3', 成绩: '90', 绩点: '4.0', 学期: '2023-2024-1' },
                { 学分: '2', 成绩: '通过', 绩点: '0', 学期: '2023-2024-1' },
            ],
            [
                { 课程代码: 'C1', 课程名称: '线性代数', 学分: '4', 已出分: true },
                { 课程代码: 'C2', 课程名称: '概率论', 学分: '2', 已出分: false },
                { 课程代码: 'C3', 课程名称: '离散数学', 学分: '1', 已出分: false },
            ],
            0,
            null,
            '2023-2024-2'
        );

        expect(env.document.getElementById('gm-estimate-result').style.display).toBe('block');
        expect(env.document.getElementById('gm-result-a').innerHTML).toContain('预测总 GPA');
        expect(env.document.getElementById('gm-result-b').innerHTML).toContain('预估 2 门');
    });

    test('LessonSearchEnhancer 控制面板包含学期选择器和选定学期同步按钮', () => {
        const { api, env } = loadRuntime();
        const enhancer = api.LessonSearchEnhancer;
        const originalGetElementById = env.document.getElementById.bind(env.document);
        const fakeElements = {
            'gm-btn-sync-start': createElement('button', { id: 'gm-btn-sync-start' }),
            'gm-btn-clear-hist': createElement('button', { id: 'gm-btn-clear-hist' }),
            'gm-panel-close': createElement('span', { id: 'gm-panel-close' }),
            'gm-panel-header': createElement('div', { id: 'gm-panel-header' }),
        };
        jest.spyOn(env.document, 'getElementById').mockImplementation((id) => fakeElements[id] || originalGetElementById(id));

        enhancer.injectControlPanel();

        const panel = originalGetElementById('gm-lesson-helper-panel');
        expect(panel.innerHTML).toContain('id="gm-sync-semester"');
        expect(panel.innerHTML).toContain('加载学期列表中');
        expect(panel.innerHTML).toContain('存储选定学期课程信息');
    });

    test('LessonSearchEnhancer selectize 数据填充学期主路径会去重排序并同步当前学期', () => {
        const semesterSource = createElement('select', {
            id: 'semester',
        });
        semesterSource.selectize = {
            options: {
                a: { value: '2023-2024-1', text: '2023-2024-1' },
                b: { value: '2024-2025-2', text: '2024-2025-2' },
                c: { value: '2024-2025-2', text: '重复学期' },
                d: { value: '', text: '空值' },
                e: { value: '2022-2023-2', nameZh: '2022-2023-2（中文）' },
                f: { value: '2021-2022-2', text: 'undefined' },
            },
        };

        const semesterItem = createElement('div', {
            className: 'item',
            textContent: '2023-2024-1',
        });
        semesterItem.innerText = '2023-2024-1';

        const semesterControl = createElement('div', { className: 'selectize-control semester' }, [semesterItem]);
        const { api, env } = loadRuntime({
            envOptions: {
                elements: [semesterSource, semesterControl],
            },
        });

        const enhancer = api.LessonSearchEnhancer;
        const originalGetElementById = env.document.getElementById.bind(env.document);
        const gmSyncSemester = createElement('select', { id: 'gm-sync-semester' });
        const fakeElements = {
            'gm-sync-semester': gmSyncSemester,
            'gm-btn-sync-start': createElement('button', { id: 'gm-btn-sync-start' }),
            'gm-btn-clear-hist': createElement('button', { id: 'gm-btn-clear-hist' }),
            'gm-panel-close': createElement('span', { id: 'gm-panel-close' }),
            'gm-panel-header': createElement('div', { id: 'gm-panel-header' }),
        };
        jest.spyOn(env.document, 'getElementById').mockImplementation((id) => fakeElements[id] || originalGetElementById(id));

        enhancer.injectControlPanel();

        expect(gmSyncSemester.childNodes.map((option) => option.value)).toEqual(['2024-2025-2', '2023-2024-1', '2022-2023-2']);
        expect(gmSyncSemester.childNodes.map((option) => option.textContent)).toContain('2022-2023-2（中文）');
        expect(gmSyncSemester.value).toBe('2023-2024-1');
    });

    test('LessonSearchEnhancer populateSemesterSelect 在无元素或无学期时返回 false', () => {
        const { api, env } = loadRuntime();
        const enhancer = api.LessonSearchEnhancer;
        const originalGetElementById = env.document.getElementById.bind(env.document);
        const getElementByIdSpy = jest.spyOn(env.document, 'getElementById');

        getElementByIdSpy.mockImplementation((id) => {
            if (id === 'gm-sync-semester') return null;
            return originalGetElementById(id);
        });

        expect(enhancer.populateSemesterSelect()).toBe(false);

        const semesterSource = createElement('select', { id: 'semester' });
        semesterSource.selectize = { options: {} };
        const gmSyncSemester = createElement('select', { id: 'gm-sync-semester' });
        getElementByIdSpy.mockImplementation((id) => {
            if (id === 'gm-sync-semester') return gmSyncSemester;
            if (id === 'semester') return semesterSource;
            return originalGetElementById(id);
        });

        expect(enhancer.populateSemesterSelect()).toBe(false);
    });

    test('LessonSearchEnhancer 初始化会轮询填充学期', () => {
        const pageConfig = createElement('div', { className: 'page-config' });
        const table = createElement('table', { id: 'table' });
        const gmSyncSemester = createElement('select', { id: 'gm-sync-semester' });
        const sessionStorage = {
            getItem: jest.fn((key) => (key === 'nwpu_course_sync_trigger' ? 'true' : null)),
            removeItem: jest.fn(),
            setItem: jest.fn(),
        };
        const { api, env, timeouts } = loadRuntime({
            envOptions: {
                elements: [pageConfig, table, gmSyncSemester],
            },
            globalOverrides: { sessionStorage },
            manualTimeouts: true,
        });

        env.window.location.href = 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search';

        const enhancer = api.LessonSearchEnhancer;
        jest.spyOn(enhancer, 'injectControlPanel').mockImplementation(() => {});
        jest.spyOn(enhancer, 'renderHistoryTags').mockImplementation(() => {});
        const populateSemesterSelectSpy = jest.spyOn(enhancer, 'populateSemesterSelect').mockReturnValue(true);
        const startSyncProcessSpy = jest.spyOn(enhancer, 'startSyncProcess').mockImplementation(() => {});

        enhancer.init();

        expect(env.intervals.size).toBe(1);

        const intervalId = [...env.intervals.keys()][0];
        env.intervals.get(intervalId)();

        expect(populateSemesterSelectSpy).toHaveBeenCalledTimes(1);
        expect(env.intervals.has(intervalId)).toBe(false);
        expect(timeouts.size).toBe(1);

        const timeoutId = [...timeouts.keys()][0];
        timeouts.get(timeoutId).fn();

        expect(sessionStorage.removeItem).toHaveBeenCalledWith('nwpu_course_sync_trigger');
        expect(startSyncProcessSpy).toHaveBeenCalledWith(true);
    });

    test('LessonSearchEnhancer syncSemesterSelect 在聚焦或选项不足时不覆盖用户选择', () => {
        const semesterSource = createElement('select', { id: 'semester' });
        semesterSource.selectize = {
            options: {
                a: { value: '2024-2025-2', text: '2024-2025-2' },
                b: { value: '2023-2024-1', text: '2023-2024-1' },
            },
        };
        const semesterItem = createElement('div', { className: 'item', textContent: '2023-2024-1' });
        semesterItem.innerText = '2023-2024-1';
        const semesterControl = createElement('div', { className: 'selectize-control semester' }, [semesterItem]);
        const gmSyncSemester = createElement('select', { id: 'gm-sync-semester', value: '2024-2025-2' });
        const gmOptionA = createElement('option', { value: '2024-2025-2', textContent: '2024-2025-2' });
        const gmOptionB = createElement('option', { value: '2023-2024-1', textContent: '2023-2024-1' });
        gmSyncSemester.appendChild(gmOptionA);
        gmSyncSemester.appendChild(gmOptionB);

        const { api, env } = loadRuntime({
            envOptions: {
                elements: [semesterSource, semesterControl, gmSyncSemester],
            },
        });
        const enhancer = api.LessonSearchEnhancer;
        const originalGetElementById = env.document.getElementById.bind(env.document);
        jest.spyOn(env.document, 'getElementById').mockImplementation((id) => {
            if (id === 'gm-sync-semester') return gmSyncSemester;
            if (id === 'semester') return semesterSource;
            return originalGetElementById(id);
        });

        env.document.activeElement = gmSyncSemester;
        enhancer.syncSemesterSelect();
        expect(gmSyncSemester.value).toBe('2024-2025-2');

        env.document.activeElement = null;
        gmSyncSemester.childNodes.length = 0;
        gmSyncSemester.appendChild(createElement('option', { value: '2024-2025-2', textContent: '2024-2025-2' }));
        enhancer.syncSemesterSelect();
        expect(gmSyncSemester.value).toBe('2024-2025-2');
    });

    test('LessonSearchEnhancer 手动同步会切换到目标学期并显示锁定抓取学期', async () => {
        const semesterSource = createElement('select', { id: 'semester' });
        semesterSource.selectize = {
            options: {
                a: { value: '2024-2025-2', text: '2024-2025-2' },
                b: { value: '2023-2024-1', text: '2023-2024-1' },
            },
        };

        const semesterItem = createElement('div', { className: 'item', textContent: '2024-2025-2' });
        semesterItem.innerText = '2024-2025-2';
        const semesterInput = createElement('div', { className: 'selectize-input' });
        const semesterControl = createElement('div', { className: 'selectize-control semester' }, [semesterInput, semesterItem]);
        const semesterOption = createElement('div', {
            className: 'option',
            'data-value': '202402',
            textContent: '2024-2025-2',
        });
        const semesterDropdown = createElement('div', { className: 'selectize-dropdown semester' }, [semesterOption]);
        const gmSyncSemester = createElement('select', { id: 'gm-sync-semester' });
        gmSyncSemester.appendChild(createElement('option', { value: '2023-2024-1', textContent: '2023-2024-1' }));
        gmSyncSemester.appendChild(createElement('option', { value: '202402', textContent: '2024-2025-2' }));
        gmSyncSemester.value = '202402';

        const confirm = jest.fn(() => true);
        const alert = jest.fn();
        const { api, env } = loadRuntime({
            envOptions: {
                elements: [semesterSource, semesterControl, semesterDropdown, gmSyncSemester],
            },
            globalOverrides: {
                confirm,
                alert,
            },
            manualTimeouts: false,
        });
        const reload = jest.fn();
        env.window.location.reload = reload;
        global.location.reload = reload;

        const enhancer = api.LessonSearchEnhancer;
        const originalGetElementById = env.document.getElementById.bind(env.document);
        const updateOverlayStatusSpy = jest.spyOn(enhancer, 'updateOverlayStatus');
        const selectSemesterOptionClick = jest.fn();
        semesterOption.click = selectSemesterOptionClick;
        const inputClick = jest.fn();
        semesterInput.click = inputClick;
        jest.spyOn(env.document, 'getElementById').mockImplementation((id) => {
            if (id === 'gm-sync-semester') return gmSyncSemester;
            if (id === 'semester') return semesterSource;
            return originalGetElementById(id);
        });

        jest.spyOn(env.document, 'querySelector').mockImplementation((selector) => {
            if (selector === '.selectize-control.semester .selectize-input') return semesterInput;
            if (selector === '.selectize-input') return semesterInput;
            if (selector === '.selectize-control.semester .item') return semesterItem;
            if (selector === '.selectize-dropdown.semester .option') return semesterOption;
            if (selector === '.option') return semesterOption;
            return env.body.querySelector(selector);
        });
        jest.spyOn(env.document, 'querySelectorAll').mockImplementation((selector) => {
            if (selector === '.selectize-dropdown.semester .option') return [semesterOption];
            if (selector === '.option') return [semesterOption];
            return env.body.querySelectorAll(selector);
        });

        await enhancer.startSyncProcess(false);

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('【2024-2025-2】'));
        expect(updateOverlayStatusSpy).toHaveBeenCalledWith(expect.stringContaining('正在切换到目标学期'));
        expect(inputClick).toHaveBeenCalledTimes(1);
        expect(selectSemesterOptionClick).toHaveBeenCalledTimes(1);
        expect(semesterOption.getAttribute('data-value')).toBe('202402');
        expect(env.document.querySelector('#gm-sync-overlay').innerHTML).toContain('锁定抓取学期: 2024-2025-2');
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('同步完成'));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test('LessonSearchEnhancer showOverlay 会转义学期文本', () => {
        const { api } = loadRuntime();
        const overlay = api.LessonSearchEnhancer.showOverlay('2024 <x> & 2');

        expect(overlay.innerHTML).toContain('锁定抓取学期: 2024 &lt;x&gt; &amp; 2');
    });

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
        expect(enhancer.selectSemesterByValue).toHaveBeenNthCalledWith(1, '202402');
        expect(enhancer.selectSemesterByValue).toHaveBeenNthCalledWith(2, '202301');
    });

    test('BackgroundSyncSystem worker 跳过 DataTables 空行', async () => {
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
        pageSize.innerText = '1000';
        const currentSemester = createElement('div', { className: 'selectize-input', textContent: '2024-2025-2' });
        currentSemester.innerText = '2024-2025-2';
        const semesterControl = createElement('div', { className: 'selectize-control semester' }, [currentSemester]);
        const semesterOption = createElement('div', { className: 'option', textContent: '2024-2025-2' });
        semesterOption.innerText = '2024-2025-2';
        const semesterDropdown = createElement('div', { className: 'selectize-dropdown-content' }, [semesterOption]);

        const { api, env } = loadRuntime({
            envOptions: {
                url: 'https://jwxt.nwpu.edu.cn/student/home',
                elements: [createElement('div', { className: 'page-config' }, [pageSize]), semesterControl, semesterDropdown, table],
            },
            manualTimeouts: false,
        });
        global.postMessage = jest.fn();
        global.top.postMessage = global.postMessage;

        api.BackgroundSyncSystem.startWorker();
        await new Promise((resolve) => setImmediate(resolve));

        const stored = JSON.parse(env.gmStorage[api.CONSTANTS.BACKGROUND_SYNC_KEY]);
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ id: 'lesson-1', code: 'U01M1001', name: '高等数学' });
    });
});
