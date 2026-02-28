/**
 * 路由分发逻辑测试
 * 
 * 核心测试场景：
 * 1. 课表页面 + 顶层窗口 → 应创建悬浮球（兜底）
 * 2. 课表页面 + iframe → 不应创建悬浮球
 * 3. 主页 + 顶层窗口 → 应初始化首页功能
 * 4. 后台 Worker → 启动后立即返回
 */

const { createMockEnv, extractFunction, SOURCE_CODE } = require('./setup');
const vm = require('vm');

/**
 * 从源码提取 runMainFeatures 并注入 mock 依赖
 */
function setupRouterTest(env) {
    const funcSource = extractFunction(SOURCE_CODE, 'runMainFeatures');
    if (!funcSource) throw new Error('Cannot find runMainFeatures');

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
        TextbookInfoModule: { init: jest.fn() },
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

    const code = `${funcSource}; _runMainFeatures = runMainFeatures;`;
    const context = vm.createContext(sandbox);
    vm.runInContext(code, context);

    return { fn: sandbox._runMainFeatures, mocks, sandbox };
}

describe('runMainFeatures 路由分发', () => {

    test('课表页面 + 顶层窗口 → 应创建悬浮球（兜底）+ 调用 TextbookInfoModule', () => {
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/for-std/course-table',
        });

        const { fn, mocks } = setupRouterTest(env);
        fn();

        expect(mocks.TextbookInfoModule.init).toHaveBeenCalled();
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

        expect(mocks.TextbookInfoModule.init).toHaveBeenCalled();
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
});
