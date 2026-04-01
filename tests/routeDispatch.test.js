/**
 * 路由分发逻辑测试
 * 
 * 核心测试场景：
 * 1. 课表页面 + 顶层窗口 → 应创建悬浮球（兜底）
 * 2. 课表页面 + iframe → 不应创建悬浮球
 * 3. 主页 + 顶层窗口 → 应初始化首页功能
 * 4. 后台 Worker → 启动后立即返回
 */

const { createMockEnv, createElement, loadFunctionByName, SOURCE_CODE } = require('./setup');

/**
 * 从源码提取 runMainFeatures 并注入 mock 依赖
 */
function setupRouterTest(env) {
    const mocks = {
        BackgroundSyncSystem: {
            WORKER_NAME: 'gm_bg_worker',
            startWorker: jest.fn(),
            initController: jest.fn(),
        },
        PersonnelSearch: { syncToken: jest.fn() },
        ConfigManager: { enablePortraitEnhancement: true },
        initEvaluationHelper: jest.fn(),
        initLessonSearchPage: jest.fn(),
        enhancePortraitPage: jest.fn(),
        initProgramPageEnhancement: jest.fn(),
        cacheCourseTableData: jest.fn(),
        autoClickAllCoursesAndScroll: jest.fn(),
        showAutoFetchSuccessToast: jest.fn(),
        TextbookInfoModule: { init: jest.fn(), initUI: jest.fn() },
        createFloatingMenu: jest.fn(),
        initializeHomePageFeatures: jest.fn(),
    };
    const sandbox = {
        ...env.window,
        ...mocks,
        window: env.window,
        document: env.document,
        location: env.window.location,
    };

    const isTeacherSite = loadFunctionByName(SOURCE_CODE, 'isTeacherSite', sandbox);
    const getTeacherSearchConfig = loadFunctionByName(SOURCE_CODE, 'getTeacherSearchConfig', sandbox);
    const trySubmitQueuedTeacherSearch = loadFunctionByName(
        SOURCE_CODE,
        'trySubmitQueuedTeacherSearch',
        sandbox,
        {
            getTeacherSearchConfig,
        }
    );
    const isTeacherSearchPage = loadFunctionByName(SOURCE_CODE, 'isTeacherSearchPage', sandbox, {
        isTeacherSite,
    });
    const initializeTeacherSearchAutoSubmit = loadFunctionByName(
        SOURCE_CODE,
        'initializeTeacherSearchAutoSubmit',
        sandbox,
        {
            getTeacherSearchConfig,
            trySubmitQueuedTeacherSearch,
        }
    );
    const initializeTeacherSitePage = loadFunctionByName(SOURCE_CODE, 'initializeTeacherSitePage', sandbox, {
        isTeacherSearchPage,
        initializeTeacherSearchAutoSubmit,
    });
    const consumeCourseTableAutoFetchFlag = jest.fn(() => false);
    const initializeCourseTableCacheOnLoad = jest.fn();
    const initializeCourseTableSemesterWatcher = jest.fn();
    const startCourseTableLessonObserver = jest.fn();
    const initializeCourseTableClickWatcher = jest.fn();
    const initializeCourseTablePage = loadFunctionByName(SOURCE_CODE, 'initializeCourseTablePage', sandbox, {
        consumeCourseTableAutoFetchFlag,
        initializeCourseTableCacheOnLoad,
        initializeCourseTableSemesterWatcher,
        startCourseTableLessonObserver,
        initializeCourseTableClickWatcher,
        autoClickAllCoursesAndScroll: mocks.autoClickAllCoursesAndScroll,
    });
    const initializeJwxtHomePage = loadFunctionByName(SOURCE_CODE, 'initializeJwxtHomePage', sandbox);

    const loaded = loadFunctionByName(SOURCE_CODE, 'runMainFeatures', sandbox, {
        isTeacherSite,
        initializeTeacherSitePage,
        initializeCourseTablePage,
        initializeJwxtHomePage,
    }, true);
    if (!loaded) throw new Error('Cannot find runMainFeatures');

    return {
        fn: loaded.fn,
        mocks,
        sandbox: loaded.sandbox,
        helpers: {
            initializeTeacherSearchAutoSubmit,
            initializeTeacherSitePage,
            initializeCourseTablePage,
            initializeJwxtHomePage,
            isTeacherSite,
            getTeacherSearchConfig,
            consumeCourseTableAutoFetchFlag,
            startCourseTableLessonObserver,
        },
    };
}

describe('runMainFeatures 路由分发', () => {

    test('课表页面 + 顶层窗口 → 应创建悬浮球（兜底）+ 调用 TextbookInfoModule', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.TextbookInfoModule.initUI).toHaveBeenCalled();
        expect(mocks.createFloatingMenu).toHaveBeenCalled();
        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
    });

    test('课表页面 + iframe → 不应创建悬浮球', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
            isIframe: true,
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.TextbookInfoModule.initUI).toHaveBeenCalled();
        expect(mocks.createFloatingMenu).not.toHaveBeenCalled();
    });

    test('主页 + 顶层窗口 → 应初始化首页功能，不应走课表分支', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.initializeHomePageFeatures).toHaveBeenCalled();
        expect(mocks.TextbookInfoModule.init).not.toHaveBeenCalled();
        expect(mocks.createFloatingMenu).not.toHaveBeenCalled();
    });

    test('后台 Worker → 启动 Worker 后立即返回，不执行其他功能', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search',
        });
        env.window.name = 'gm_bg_worker';

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.BackgroundSyncSystem.startWorker).toHaveBeenCalled();
        expect(mocks.initLessonSearchPage).not.toHaveBeenCalled();
        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
    });

    test('gm-id-fetcher-patch iframe → 直接返回，不执行其他功能', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        });
        env.window.frameElement = { id: 'gm-id-fetcher-patch' };

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.TextbookInfoModule.init).not.toHaveBeenCalled();
        expect(mocks.createFloatingMenu).not.toHaveBeenCalled();
        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
    });

    test('ecampus 页面 → 只同步 token 并直接返回', () => {
        const env = createMockEnv({
            url: 'https://ecampus.nwpu.edu.cn/portal',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.PersonnelSearch.syncToken).toHaveBeenCalledTimes(1);
        expect(mocks.initLessonSearchPage).not.toHaveBeenCalled();
        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
    });

    test('开课查询页面 → 应初始化开课查询', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/lesson-search',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.initLessonSearchPage).toHaveBeenCalled();
        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
    });

    test('培养方案页面 → 应初始化培养方案增强', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/program/info/12345',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.initProgramPageEnhancement).toHaveBeenCalled();
    });

    test('课表页面自动获取标记存在时 → 应自动点击全部课程并清除标记', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        });
        env.gmStorage['jwxt_auto_fetch_course_table'] = Date.now();

        const { fn, mocks, helpers } = setupRouterTest(env);
        helpers.consumeCourseTableAutoFetchFlag.mockImplementation(() => {
            env.window.GM_setValue('jwxt_auto_fetch_course_table', 0);
            return true;
        });
        fn();

        expect(mocks.autoClickAllCoursesAndScroll).toHaveBeenCalledTimes(1);
        expect(env.gmStorage['jwxt_auto_fetch_course_table']).toBe(0);
        expect(helpers.startCourseTableLessonObserver).toHaveBeenCalledWith(true);
    });

    test('teacher 搜索页慢加载时应在表单真正提交后才清除队列', () => {
        const env = createMockEnv({
            url: 'https://teacher.nwpu.edu.cn/search/syss/.html',
        });
        env.window.GM_setValue('gm_cross_search_name', '张三');

        const { helpers } = setupRouterTest(env);
        helpers.initializeTeacherSearchAutoSubmit.call(env.window);

        const intervalId = [...env.intervals.keys()][0];
        expect(intervalId).toBeDefined();

        const intervalFn = env.intervals.get(intervalId);
        expect(typeof intervalFn).toBe('function');

        intervalFn();
        expect(env.gmStorage['gm_cross_search_name']).toBe('张三');
        expect(env.window.GM_setValue).not.toHaveBeenCalledWith('gm_cross_search_name', '');

        const input = createElement('input', { id: 'sea' });
        const button = createElement('button', { className: 'dyym2_btn' });
        const clickSpy = jest.fn();
        button.addEventListener('click', clickSpy);
        env.document.body.appendChild(input);
        env.document.body.appendChild(button);

        intervalFn();

        expect(input.value).toBe('张三');
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(env.gmStorage['gm_cross_search_name']).toBe('');
        expect(env.intervals.has(intervalId)).toBe(false);
    });

    test('teacher 非 /search 页面不应落入 jwxt 首页初始化', () => {
        const env = createMockEnv({
            url: 'https://teacher.nwpu.edu.cn/profile/12345',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.initializeHomePageFeatures).not.toHaveBeenCalled();
        expect(mocks.createFloatingMenu).not.toHaveBeenCalled();
        expect(mocks.BackgroundSyncSystem.initController).not.toHaveBeenCalled();
    });
});
