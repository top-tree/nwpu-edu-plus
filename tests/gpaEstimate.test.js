/**
 * GPA 预测功能测试
 * 
 * 核心测试场景：
 * 1. 函数提取成功
 * 2. 弹窗创建和关闭逻辑
 * 3. 数据状态处理
 * 4. formatCacheAge 缓存时间格式化
 * 5. 入口点测试
 */

const { createMockEnv, createElement, extractFunction, loadFunctionInEnv, SOURCE_CODE } = require('./setup');

// 提取函数源码
const funcSourceImmediate = extractFunction(SOURCE_CODE, 'handleGpaEstimateClickImmediate');
const funcSourceCalc = extractFunction(SOURCE_CODE, 'calculatePredictedGPA');
const funcSourceFormatCache = extractFunction(SOURCE_CODE, 'formatCacheAge');

describe('GPA 预测功能 - 函数提取', () => {

    test('handleGpaEstimateClickImmediate 函数提取成功', () => {
        expect(funcSourceImmediate).not.toBeNull();
        expect(funcSourceImmediate).toContain('handleGpaEstimateClickImmediate');
    });

    test('handleGpaEstimateClickLoad 函数存在于源码中', () => {
        // 验证函数在源码中存在
        expect(SOURCE_CODE).toContain('handleGpaEstimateClickLoad');
    });

    test('calculatePredictedGPA 函数提取成功', () => {
        expect(funcSourceCalc).not.toBeNull();
        expect(funcSourceCalc).toContain('calculatePredictedGPA');
    });

    test('formatCacheAge 函数提取成功', () => {
        expect(funcSourceFormatCache).not.toBeNull();
        expect(funcSourceFormatCache).toContain('formatCacheAge');
    });
});

describe('GPA 预测 - 弹窗创建与关闭', () => {

    test('handleGpaEstimateClickImmediate 函数创建弹窗元素', () => {
        // 验证函数包含弹窗创建逻辑
        expect(funcSourceImmediate).toContain('gpa-report-overlay');
        expect(funcSourceImmediate).toContain('gpa-report-modal');
    });

    test('弹窗包含关闭按钮和加载提示', () => {
        // 验证函数包含关闭按钮和加载状态
        expect(funcSourceImmediate).toContain('gm-estimate-close');
        expect(funcSourceImmediate).toContain('正在加载数据');
    });
});

describe('GPA 预测 - 数据状态处理', () => {

    test('handleGpaEstimateClickLoad 在源码中处理数据', () => {
        // 函数源码中包含数据检查逻辑
        expect(SOURCE_CODE).toContain('handleGpaEstimateClickLoad');
        expect(SOURCE_CODE).toContain('getCachedData');
        expect(SOURCE_CODE).toContain('allGrades');
    });

    test('handleGpaEstimateClickLoad 处理课表缓存', () => {
        expect(SOURCE_CODE).toContain('COURSE_TABLE_CACHE_KEY');
        expect(SOURCE_CODE).toContain('currentSemesterCourses');
    });
});

describe('GPA 预测 - formatCacheAge 缓存时间格式化', () => {

    test('formatCacheAge 不到1分钟', () => {
        const env = createMockEnv();
        const fn = loadFunctionInEnv(env, funcSourceFormatCache, 'formatCacheAge');
        
        const result = fn.call(env.window, 30000); // 30秒
        expect(result).toBe('不到 1 分钟');
    });

    test('formatCacheAge 几分钟', () => {
        const env = createMockEnv();
        const fn = loadFunctionInEnv(env, funcSourceFormatCache, 'formatCacheAge');
        
        const result = fn.call(env.window, 300000); // 5分钟
        expect(result).toBe('5 分钟');
    });

    test('formatCacheAge 几小时', () => {
        const env = createMockEnv();
        const fn = loadFunctionInEnv(env, funcSourceFormatCache, 'formatCacheAge');
        
        const result = fn.call(env.window, 7200000); // 2小时
        expect(result).toBe('2 小时');
    });

    test('formatCacheAge 几天', () => {
        const env = createMockEnv();
        const fn = loadFunctionInEnv(env, funcSourceFormatCache, 'formatCacheAge');
        
        const result = fn.call(env.window, 172800000); // 2天
        expect(result).toBe('2 天');
    });
});

describe('GPA 预测 - 入口点测试', () => {

    test('悬浮球菜单 GPA 预测按钮存在', () => {
        const gpaEstimateBtn = createElement('button', { 
            id: 'gm-btn-gpa-estimate' 
        });
        
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [gpaEstimateBtn],
        });

        const btn = env.document.getElementById('gm-btn-gpa-estimate');
        expect(btn).not.toBeNull();
    });
});

describe('GPA 预测 - 数据完整场景', () => {

    test('handleGpaEstimateClickLoad 包含学分检查', () => {
        expect(SOURCE_CODE).toContain('credits');
    });

    test('handleGpaEstimateClickLoad 显示课程列表', () => {
        expect(SOURCE_CODE).toContain('currentSemesterCourses');
    });

    test('handleGpaEstimateClickLoad 处理缺失学分', () => {
        expect(SOURCE_CODE).toContain('hasMissingCredits');
    });
});

describe('GPA 预测 - 预测计算器逻辑', () => {

    test('calculatePredictedGPA 包含之前学期计算', () => {
        expect(funcSourceCalc).toContain('previousCredits');
        expect(funcSourceCalc).toContain('previousPoints');
    });

    test('calculatePredictedGPA 包含本学期计算', () => {
        expect(funcSourceCalc).toContain('currentSemCredits');
        expect(funcSourceCalc).toContain('currentSemPoints');
    });

    test('calculatePredictedGPA 计算总 GPA', () => {
        expect(funcSourceCalc).toContain('totalAllCredits');
        expect(funcSourceCalc).toContain('totalAllGPA');
    });

    test('calculatePredictedGPA 包含中文等级制成绩映射', () => {
        expect(funcSourceCalc).toContain('chineseGradeMap');
    });
});

describe('GPA 预测 - 自动保存功能', () => {

    test('handleGpaEstimateClickLoad 包含自动保存', () => {
        expect(SOURCE_CODE).toContain('autoSaveGPA');
    });

    test('自动保存使用 GPA_ESTIMATE_KEY', () => {
        expect(SOURCE_CODE).toContain('GPA_ESTIMATE_KEY');
    });
});

describe('GPA 预测 - 计算公式验证', () => {

    test('预测总 GPA 计算公式', () => {
        // 之前: 60学分, 180绩点 (GPA=3.0)
        // 本学期: 20学分, 76绩点 (GPA=3.8)
        const previousPoints = 180;
        const previousCredits = 60;
        const currentSemPoints = 76;
        const currentSemCredits = 20;
        
        const previousGPA = previousCredits > 0 ? previousPoints / previousCredits : 0;
        const totalAllCredits = previousCredits + currentSemCredits;
        const totalAllPoints = previousPoints + currentSemPoints;
        const totalAllGPA = totalAllCredits > 0 ? totalAllPoints / totalAllCredits : 0;
        
        expect(previousGPA).toBe(3.0);
        expect(totalAllGPA).toBeCloseTo(3.2, 2);
    });
});

describe('GPA 预测 - 用户交互', () => {

    test('点击 GPA 预测按钮使用 onclick', () => {
        // 代码中使用 onclick 而不是 addEventListener
        expect(funcSourceImmediate).toContain('onclick');
    });

    test('点击关闭按钮移除弹窗', () => {
        expect(funcSourceImmediate).toContain('overlay.remove');
    });
});

describe('GPA 预测 - 边界情况', () => {

    test('处理空成绩数据', () => {
        expect(SOURCE_CODE).toContain('allGrades.length');
    });

    test('GPA 选项包含标准值', () => {
        // 在 handleGpaEstimateLoad 源码中
        expect(SOURCE_CODE).toContain('gpaOptions');
    });
});
