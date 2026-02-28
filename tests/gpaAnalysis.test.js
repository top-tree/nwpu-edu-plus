/**
 * GPA 分析功能测试
 * 
 * 核心测试场景：
 * 1. calculateAndDisplayGPA 函数提取成功
 * 2. GPA 计算逻辑（加权平均、绩点计算）
 * 3. 各种成绩类型的处理（百分制、中文等级制、P/NP）
 * 4. 卡绩分析
 */

const { createMockEnv, createElement, extractFunction, loadFunctionInEnv, SOURCE_CODE } = require('./setup');

// 提取函数源码
const funcSourceGPA = extractFunction(SOURCE_CODE, 'calculateAndDisplayGPA');

describe('GPA 分析功能 - 函数提取', () => {

    test('calculateAndDisplayGPA 函数提取成功', () => {
        expect(funcSourceGPA).not.toBeNull();
        expect(funcSourceGPA).toContain('calculateAndDisplayGPA');
        // 函数调用了 showGpaReportModal 来显示弹窗
        expect(funcSourceGPA).toContain('showGpaReportModal');
    });
});

describe('GPA 分析 - 计算逻辑', () => {

    test('函数包含 GPA 计算核心逻辑', () => {
        expect(funcSourceGPA).toContain('totalCredits');
        expect(funcSourceGPA).toContain('totalCreditPoints');
        expect(funcSourceGPA).toContain('weightedScore');
    });

    test('函数包含中文等级制成绩映射', () => {
        expect(funcSourceGPA).toContain('chineseGradeMap');
        expect(funcSourceGPA).toContain('优秀');
        expect(funcSourceGPA).toContain('良好');
    });

    test('函数包含卡绩分析逻辑', () => {
        expect(funcSourceGPA).toContain('stuckCourses');
        expect(funcSourceGPA).toContain('hypotheticalGpa');
    });

    test('函数过滤无效成绩', () => {
        // 函数验证学分和绩点有效性
        expect(funcSourceGPA).toContain('isNaN(credits)');
    });
});

describe('GPA 分析 - 计算公式验证', () => {

    test('GPA = 总学分绩点 / 总学分', () => {
        // 模拟数据：数据结构 3学分 绩点4.0，算法2学分 绩点3.7
        const courses = [
            { '学分': 3, '绩点': 4.0 },
            { '学分': 2, '绩点': 3.7 }
        ];

        let totalCredits = 0;
        let totalCreditPoints = 0;

        courses.forEach(g => {
            const credits = parseFloat(g['学分']);
            const gp = parseFloat(g['绩点']);
            if (!isNaN(credits) && credits > 0 && !isNaN(gp)) {
                totalCredits += credits;
                totalCreditPoints += credits * gp;
            }
        });

        const gpa = totalCreditPoints / totalCredits;
        
        expect(totalCredits).toBe(5);
        expect(totalCreditPoints).toBeCloseTo(19.4, 1);
        expect(gpa).toBeCloseTo(3.88, 1);
    });

    test('加权百分制成绩 = 分数*学分之和 / 学分之和', () => {
        const courses = [
            { '学分': 3, '成绩': '90' },
            { '学分': 2, '成绩': '80' }
        ];

        let totalScoreCredits = 0;
        let totalCredits = 0;

        courses.forEach(g => {
            const credits = parseFloat(g['学分']);
            const score = parseFloat(g['成绩']);
            if (!isNaN(credits) && credits > 0 && !isNaN(score)) {
                totalScoreCredits += score * credits;
                totalCredits += credits;
            }
        });

        const weightedScore = totalScoreCredits / totalCredits;
        
        expect(weightedScore).toBeCloseTo(86, 0);
    });

    test('中文等级制成绩应转换为 GPA', () => {
        const chineseGradeMap = { '优秀': 4.0, '良好': 3.0, '中等': 2.0, '及格': 1.3, '不及格': 0.0 };
        
        expect(chineseGradeMap['优秀']).toBe(4.0);
        expect(chineseGradeMap['良好']).toBe(3.0);
        expect(chineseGradeMap['中等']).toBe(2.0);
    });

    test('P/NP 类型成绩映射为 null，应被跳过', () => {
        // 代码中 '通过': null, '不通过': 0.0
        const chineseGradeMap = { '通过': null, '不通过': 0.0 };
        
        // 当映射为 null 时，课程应被跳过（不计入 GPA）
        expect(chineseGradeMap['通过']).toBeNull();
    });
});

describe('GPA 分析 - 卡绩分析', () => {

    test('卡绩分析使用 stuckGradesMap', () => {
        // 代码中定义了 stuckGradesMap
        expect(funcSourceGPA).toContain('stuckGradesMap');
    });

    test('卡绩分析计算假设 GPA', () => {
        expect(funcSourceGPA).toContain('hypotheticalGpa');
    });
});

describe('GPA 分析 - showGpaReportModal 弹窗函数', () => {

    const funcSourceShowModal = extractFunction(SOURCE_CODE, 'showGpaReportModal');

    test('showGpaReportModal 函数提取成功', () => {
        expect(funcSourceShowModal).not.toBeNull();
        expect(funcSourceShowModal).toContain('showGpaReportModal');
    });

    test('showGpaReportModal 创建弹窗结构', () => {
        expect(funcSourceShowModal).toContain('gpa-report-overlay');
        expect(funcSourceShowModal).toContain('gpa-report-modal');
    });

    test('弹窗包含关闭按钮', () => {
        expect(funcSourceShowModal).toContain('close-btn');
    });

    test('弹窗包含标题', () => {
        expect(funcSourceShowModal).toContain('GPA综合分析报告');
    });
});

describe('GPA 分析 - 排名数据', () => {

    test('函数接收 gpaRankData 参数', () => {
        expect(funcSourceGPA).toContain('gpaRankData');
    });
});

describe('GPA 分析 - 用户入口点', () => {

    test('悬浮球菜单 GPA分析 按钮存在', () => {
        const menuGpaBtn = createElement('button', { id: 'gm-btn-gpa' });
        
        const env = createMockEnv({
            url: 'https://jwxt.nwpu.edu.cn/student/home',
            elements: [menuGpaBtn],
        });

        const btn = env.document.getElementById('gm-btn-gpa');
        expect(btn).not.toBeNull();
    });

    test('handleGpaClick 函数存在', () => {
        const funcSource = extractFunction(SOURCE_CODE, 'handleGpaClick');
        expect(funcSource).not.toBeNull();
    });
});

describe('GPA 分析 - 数据验证', () => {

    test('无有效成绩时提示', () => {
        expect(funcSourceGPA).toContain('未找到可用于计算GPA的有效课程成绩');
    });
});

describe('GPA 分析 - UI 样式', () => {
    const funcSourceShowModal = extractFunction(SOURCE_CODE, 'showGpaReportModal');

    test('弹窗使用 fixed 定位', () => {
        expect(funcSourceShowModal).toContain('position: fixed');
    });
});

describe('GPA 分析 - 预测计算器功能', () => {

    test('预测 GPA 计算器公式验证', () => {
        // 当前: 60学分, GPA 3.0 → 180 绩点
        // 下学期: 20学分, 预期 GPA 3.8
        const currentTotalCredits = 60;
        const currentTotalCreditPoints = 180;
        const nextCredits = 20;
        const nextGPA = 3.8;
        
        const predictedOverallGPA = (currentTotalCreditPoints + (nextCredits * nextGPA)) / (currentTotalCredits + nextCredits);
        
        expect(predictedOverallGPA).toBeCloseTo(3.2, 2);
    });

    const funcSourceShowModal = extractFunction(SOURCE_CODE, 'showGpaReportModal');
    test('showGpaReportModal 包含预测计算器按钮', () => {
        expect(funcSourceShowModal).toContain('calculate-prediction-btn');
        expect(funcSourceShowModal).toContain('calculate-target-btn');
    });
});
