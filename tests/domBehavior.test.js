const { createMockEnv, createElement, loadFunctionByName, SOURCE_CODE } = require('./setup');

function buildHarness({
    elements = [],
    url = 'https://jwxt.nwpu.edu.cn/student/home',
    includeRequestIdleCallback = true,
    readyState = 'complete',
    overrides = {},
} = {}) {
    const env = createMockEnv({
        url,
        elements,
        getCachedData: overrides.getCachedData,
    });
    const { window, document } = env;
    const timerCalls = [];

    const defaults = {
        Logger: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
        },
        GM_getValue: jest.fn(),
        GM_setValue: jest.fn(),
        unsafeWindow: {},
        ConfigManager: {
            enablePortraitEnhancement: true,
            enableCourseWatch: true,
        },
        PersonnelSearch: {
            openModal: jest.fn(),
            syncToken: jest.fn(),
        },
        BackgroundSyncSystem: {
            WORKER_NAME: 'gm_bg_worker',
            startWorker: jest.fn(),
            initController: jest.fn(),
        },
        printStorageDiagnosis: jest.fn(),
        createFloatingMenu: jest.fn(),
        initExportUI: jest.fn(),
        initScheduleWidget: jest.fn(),
        updateMenuButtonsState: jest.fn(),
        getCachedData: jest.fn(),
        fetchAllDataAndCache: jest.fn(async () => {}),
        handleHelpClick: jest.fn(),
        handleExportClick: jest.fn(),
        handleGpaClick: jest.fn(),
        handleSyncCourseClick: jest.fn(),
        handleShowFollowedClick: jest.fn(),
        handleJumpToEvaluation: jest.fn(),
        handleGpaEstimateClickImmediate: jest.fn(),
        calculateAndDisplayGPA: jest.fn(),
        showSemesterCheckboxes: jest.fn(),
        scrollToBottom: jest.fn(),
        hideMenu: jest.fn(),
        showMenu: jest.fn(),
        floatBall: null,
        floatMenu: null,
        menuExportBtn: null,
        menuGpaBtn: null,
        menuSyncBtn: null,
        menuFollowBtn: null,
        menuHupanBtn: null,
        semesterCheckboxContainer: null,
        isDataReady: false,
        isBackgroundSyncing: false,
        confirm: jest.fn(() => true),
        alert: jest.fn(),
        open: jest.fn(),
    };

    const timerStubs = {
        setTimeout: jest.fn((fn, delay) => {
            timerCalls.push({ type: 'timeout', delay, fn });
            return timerCalls.length;
        }),
        clearTimeout: jest.fn(),
        setInterval: jest.fn((fn, delay) => {
            timerCalls.push({ type: 'interval', delay, fn });
            return timerCalls.length;
        }),
        clearInterval: jest.fn(),
    };

    const windowStubs = {
        ...defaults,
        ...timerStubs,
        ...overrides,
    };

    if (includeRequestIdleCallback) {
        windowStubs.requestIdleCallback = overrides.requestIdleCallback || jest.fn((cb) => cb({ timeRemaining: () => 50 }));
    }

    Object.entries(windowStubs).forEach(([key, value]) => {
        window[key] = value;
    });

    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
    Object.defineProperty(document, 'readyState', { value: readyState, configurable: true });
    window.scrollTo = overrides.scrollTo || jest.fn();

    return {
        env,
        window,
        document,
        timerCalls,
        stubs: windowStubs,
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
        createElement('td', {}, graded
            ? [createElement('input', { 'data-field': 'gpa', 'data-graded': 'true', value: String(gpa) })]
            : [
                createElement('select', { 'data-field': 'gpa', value: String(gpa) }),
                createElement('input', { 'data-field': 'gpa-custom', value: String(custom) }),
            ]),
    ];

    return createElement('tr', { 'data-code': code }, cells);
}

function buildScoreContent({ includeRankTile = false, rank = 7 } = {}) {
    const avgInfo = createElement('div', { className: 'info', textContent: '平均分' });
    avgInfo.innerHTML = '平均分';
    const scoreItem = createElement('li', { className: 'score-item' }, [
        createElement('div', { className: 'score-info' }, [
            createElement('div', { className: 'score', textContent: '88' }),
            avgInfo,
        ]),
    ]);
    const nodes = [scoreItem];
    if (includeRankTile) {
        const rankInfo = createElement('div', { className: 'info', textContent: '专业排名' });
        rankInfo.innerHTML = '专业排名';
        nodes.push(createElement('li', { id: 'gm-major-rank-tile', className: 'score-item' }, [
            createElement('div', { className: 'score', textContent: String(rank) }),
            rankInfo,
        ]));
    }
    return createElement('ul', { id: 'score-content', 'data-gm-enhanced-summary': includeRankTile ? 'true' : undefined }, nodes);
}

function buildSemesterObserverTree(value = '全部') {
    return createElement('div', {}, [
        createElement('div', { className: 'myScore' }, [
            createElement('div', { className: 'el-select' }, [
                createElement('input', { className: 'el-input__inner', value }),
            ]),
        ]),
        createElement('li', { id: 'gm-weighted-score-tile', className: 'score-item' }, [
            createElement('div', { className: 'score', textContent: '86.0000' }),
        ]),
    ]);
}

function load(window, funcName, globals = {}) {
    const loaded = loadFunctionByName(SOURCE_CODE, funcName, window, globals, true);
    expect(loaded).not.toBeNull();
    return loaded;
}

describe('纯函数和表格计算', () => {
    test('getPassStatus 覆盖中文、数字和失败分支', () => {
        const { window } = buildHarness();
        const { fn } = load(window, 'getPassStatus');

        expect(fn('优秀')).toContain('通过');
        expect(fn('不及格')).toContain('不通过');
        expect(fn('72')).toContain('通过');
        expect(fn('59')).toContain('不通过');
        expect(fn('abc')).toBe('');
    });

    test('precomputeAllWeightedScores 只计算可解析的百分制成绩', () => {
        const { window } = buildHarness();
        const { fn } = load(window, 'precomputeAllWeightedScores');

        const result = fn([
            { 学期: '2023-2024-1', 学分: '3', 成绩: '90' },
            { 学期: '2023-2024-1', 学分: '2', 成绩: '80' },
            { 学期: '2023-2024-1', 学分: '2', 成绩: '优秀' },
            { 学期: '2023-2024-2', 学分: '1', 成绩: '100' },
        ]);

        expect(result['2023-2024-1'].weightedScore).toBe('86.0000');
        expect(result['2023-2024-2'].weightedScore).toBe('100.0000');
        expect(result.全部.weightedScore).toBe('88.3333');
        expect(result.全部.tooltipText).toContain('所有学期加权百分制成绩');
    });
});

describe('GPA 预测计算', () => {
    test('calculatePredictedGPA 在未填写预估 GPA 时给出提醒', () => {
        const { window, stubs } = buildHarness({
            elements: [
                buildGpaResultPanel(),
                createElement('table', {}, [
                    createElement('tbody', {}, [
                        buildGpaCourseRow({ code: 'C1', credits: 2 }),
                    ]),
                ]),
            ],
        });

        const { fn } = load(window, 'calculatePredictedGPA');
        const contentDiv = window.document.body;

        fn(
            contentDiv,
            [{ 学分: '2', 成绩: '90', 绩点: '4.0', 学期: '2023-2024-1' }],
            [{ 课程代码: 'C1', 课程名称: '高等数学', 学分: '2', 已出分: false }],
            0,
            null,
            '2023-2024-2',
        );

        expect(window.document.getElementById('gm-estimate-result').style.display).toBe('block');
        expect(window.document.getElementById('gm-result-a').innerHTML).toContain('请先为以下课程选择预估 GPA');
        expect(window.document.getElementById('gm-result-b').innerHTML).toBe('');
        expect(stubs.Logger.log).not.toHaveBeenCalled();
    });

    test('calculatePredictedGPA 会计算本学期、历史学期和总 GPA', () => {
        const { window, stubs } = buildHarness({
            elements: [
                buildGpaResultPanel(),
                createElement('table', {}, [
                    createElement('tbody', {}, [
                        buildGpaCourseRow({ code: 'C1', credits: 4, graded: true, gpa: 3.7 }),
                        buildGpaCourseRow({ code: 'C2', credits: 2, gpa: 'custom', custom: 3.9 }),
                        buildGpaCourseRow({ code: 'C3', credits: 1, gpa: 3.0 }),
                    ]),
                ]),
            ],
        });

        const { fn } = load(window, 'calculatePredictedGPA');
        const contentDiv = window.document.body;

        fn(
            contentDiv,
            [
                { 学分: '3', 成绩: '90', 绩点: '4.0', 学期: '2023-2024-1' },
                { 学分: '2', 成绩: '优秀', 绩点: '4.0', 学期: '2023-2024-1' },
                { 学分: '1', 成绩: '85', 绩点: '3.5', 学期: '2023-2024-2' },
            ],
            [
                { 课程代码: 'C1', 课程名称: '高等数学', 学分: '4', 已出分: true, 绩点: '3.7', 成绩: '良好' },
                { 课程代码: 'C2', 课程名称: '英语', 学分: '2', 已出分: false },
                { 课程代码: 'C3', 课程名称: '实验', 学分: '1', 已出分: false },
            ],
            0,
            null,
            '2023-2024-2',
        );

        expect(window.document.getElementById('gm-estimate-result').style.display).toBe('block');
        expect(window.document.getElementById('gm-result-a').innerHTML).toContain('5.0');
        expect(window.document.getElementById('gm-result-a').innerHTML).toContain('4.0000');
        expect(window.document.getElementById('gm-result-a').innerHTML).toContain('3.8000');
        expect(window.document.getElementById('gm-result-b').innerHTML).toContain('已出分 1 门 + 预估 2 门');
        expect(stubs.Logger.log).toHaveBeenCalledWith('GPA 预测', expect.stringContaining('当前学期: 2023-2024-2'));
    });
});

describe('首页初始化和悬浮菜单', () => {
    test('initializeHomePageFeatures 使用 requestIdleCallback 处理缓存命中', async () => {
        const { window, timerCalls, stubs } = buildHarness({
            overrides: {
                getCachedData: jest.fn(() => ({ allGrades: [1], semesterNames: ['2023-2024-1'] })),
            },
        });

        const { fn, sandbox } = load(window, 'initializeHomePageFeatures');
        await fn();

        expect(stubs.printStorageDiagnosis).toHaveBeenCalledTimes(1);
        expect(stubs.createFloatingMenu).toHaveBeenCalledTimes(1);
        expect(stubs.initExportUI).toHaveBeenCalledTimes(1);
        expect(stubs.initScheduleWidget).toHaveBeenCalledTimes(1);
        expect(stubs.updateMenuButtonsState).toHaveBeenNthCalledWith(1, false);
        expect(stubs.updateMenuButtonsState).toHaveBeenNthCalledWith(2, true);
        expect(stubs.GM_setValue).toHaveBeenCalledWith('jwxt_enhanced_v162_intro_shown', true);
        expect(timerCalls.some((item) => item.type === 'timeout' && item.delay === 1500)).toBe(true);
        expect(sandbox.isDataReady).toBe(true);
        expect(stubs.unsafeWindow.nwpuDiag()).toBe('✅ 诊断报告已生成');
        expect(Object.getOwnPropertyDescriptor(stubs.unsafeWindow, 'axjw_test').get()).toBe('✅ 正在生成报告...');
    });

    test('initializeHomePageFeatures 在无 requestIdleCallback 时退回 setTimeout 加载', async () => {
        const { window, timerCalls, stubs } = buildHarness({
            includeRequestIdleCallback: false,
            overrides: {
                getCachedData: jest.fn(() => null),
            },
        });

        const { fn } = load(window, 'initializeHomePageFeatures');
        await fn();

        const loadTimer = timerCalls.find((item) => item.type === 'timeout' && item.delay === 1000);
        expect(loadTimer).toBeDefined();

        await loadTimer.fn();
        expect(stubs.fetchAllDataAndCache).toHaveBeenCalledTimes(1);
        expect(stubs.updateMenuButtonsState).toHaveBeenCalledWith(true);
    });
});

describe('头像增强和自动跳转辅助', () => {
    test('updateSummaryTilesForPortrait 在开启状态下会增强统计卡片', () => {
        const { window, stubs } = buildHarness({
            elements: [buildScoreContent()],
        });
        const { fn } = load(window, 'updateSummaryTilesForPortrait', {
            getPassStatus: load(window, 'getPassStatus').fn,
        });

        const scoreContentElement = window.document.getElementById('score-content');
        fn(
            { gpaRankData: { rank: 7 } },
            scoreContentElement,
            {
                全部: {
                    weightedScore: '86.0000',
                    tooltipText: '所有学期加权百分制成绩',
                },
            },
        );

        expect(scoreContentElement.dataset.gmEnhancedSummary).toBe('true');
        expect(window.document.getElementById('gm-weighted-score-tile')).not.toBeNull();
        expect(window.document.getElementById('gm-weighted-score-tile').querySelector('.score').textContent).toBe('86.0000');
        expect(window.document.getElementById('gm-major-rank-tile').innerHTML).toContain('7');
        expect(scoreContentElement.querySelector('.info').innerHTML).toContain('加权百分制分数');
        expect(stubs.ConfigManager.enablePortraitEnhancement).toBe(true);
    });

    test('updateSummaryTilesForPortrait 在关闭状态下会还原并移除增强卡片', () => {
        const { window } = buildHarness({
            elements: [buildScoreContent({ includeRankTile: true })],
            overrides: {
                ConfigManager: {
                    enablePortraitEnhancement: false,
                    enableCourseWatch: true,
                },
            },
        });
        const { fn } = load(window, 'updateSummaryTilesForPortrait', {
            getPassStatus: load(window, 'getPassStatus').fn,
        });

        const scoreContentElement = window.document.getElementById('score-content');
        fn({ gpaRankData: { rank: 7 } }, scoreContentElement, {
            全部: { weightedScore: '86.0000', tooltipText: '所有学期加权百分制成绩' },
        });

        expect(scoreContentElement.getAttribute('data-gm-enhanced-summary')).toBe('true');
        expect(window.document.getElementById('gm-weighted-score-tile')).toBeNull();
        expect(window.document.getElementById('gm-major-rank-tile').querySelector('.score').textContent).toBe('7');
        expect(scoreContentElement.querySelector('.info').innerHTML).toBe('平均分');
    });

    test('autoClickAllCoursesAndScroll 会点击“全部课程”并滚动到底部', () => {
        const { window, stubs, timerCalls } = buildHarness({
            elements: [
                createElement('button', { id: 'all-courses', textContent: '全部课程' }),
                createElement('div', { className: 'course-table-container' }),
            ],
        });

        const clickSpy = jest.fn();
        window.document.getElementById('all-courses').addEventListener('click', clickSpy);
        const { fn } = load(window, 'autoClickAllCoursesAndScroll');
        fn();

        const clickTimer = timerCalls.find((item) => item.type === 'timeout' && item.delay === 1500);
        expect(clickTimer).toBeDefined();
        clickTimer.fn();

        const scrollTimer = timerCalls.find((item) => item.type === 'timeout' && item.delay === 2000);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(scrollTimer).toBeDefined();
        scrollTimer.fn();
        expect(stubs.scrollToBottom).toHaveBeenCalledTimes(1);
        expect(stubs.Logger.log).toHaveBeenCalledWith('课表自动操作', expect.stringContaining('找到并点击'));
    });

    test('showAutoFetchSuccessToast 会插入提示和样式', () => {
        const { window, timerCalls } = buildHarness();

        const { fn } = load(window, 'showAutoFetchSuccessToast');
        fn(12);

        expect(window.document.getElementById('gm-toast-style')).not.toBeNull();
        expect(window.document.body.childNodes.some((node) => (node.innerHTML || '').includes('共获取 12 门课程'))).toBe(true);
        expect(timerCalls.some((item) => item.type === 'timeout' && item.delay === 5000)).toBe(true);
    });

    test('createEnhancedOutOfPlanTableForPortrait 在关闭增强时会清理临时表格', () => {
        const originalTableContainer = createElement('div', {
            id: 'original-table',
            style: { display: 'none' },
            'data-gm-enhanced': 'true',
        });
        const enhancedContainer = createElement('div', { id: 'gm-enhanced-table-wrapper' });

        const { window } = buildHarness({
            elements: [enhancedContainer, originalTableContainer],
            overrides: {
                ConfigManager: {
                    enablePortraitEnhancement: false,
                    enableCourseWatch: true,
                },
            },
        });

        const { fn } = load(window, 'createEnhancedOutOfPlanTableForPortrait');
        fn({ allGrades: [] }, originalTableContainer);

        expect(window.document.getElementById('gm-enhanced-table-wrapper')).toBeNull();
        expect(originalTableContainer.style.display).toBe('');
        expect(originalTableContainer.getAttribute('data-gm-enhanced')).toBeNull();
    });
});
