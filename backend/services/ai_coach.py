from backend.models.schemas import IssueItem, PerformanceAnalysisResult, SheetAnalysisResult, ScoreBreakdown
from backend.services.google_ai import generate_text, is_google_configured
from backend.services.tempo_notation import format_tempo_mark


def build_coaching_text(
    sheet: SheetAnalysisResult | None,
    performance: PerformanceAnalysisResult | None,
    scores: ScoreBreakdown,
) -> str:
    lines = [f"同学你好！本次练习总评：{scores.grade}，综合得分 {scores.overall} 分。"]
    lines.append(scores.summary)

    if sheet:
        lines.append(f"谱面识别：《{sheet.title}》，{sheet.key_signature}，{sheet.time_signature}。")
        if sheet.articulation_markings:
            lines.append("谱面标记：" + "；".join(sheet.articulation_markings[:3]) + "。")

    all_issues: list[IssueItem] = []
    if sheet:
        all_issues.extend(sheet.issues)
    if performance:
        all_issues.extend(performance.issues)

    errors = [i for i in all_issues if i.severity == "error"]
    warnings = [i for i in all_issues if i.severity == "warning"]

    if errors:
        lines.append("最需要改正的地方：")
        for idx, issue in enumerate(errors[:3], 1):
            lines.append(f"{idx}. {issue.message}——{issue.suggestion}")

    if warnings:
        lines.append("还可以更好的地方：")
        for idx, issue in enumerate(warnings[:3], 1):
            lines.append(f"{idx}. {issue.message}——{issue.suggestion}")

    if scores.overall >= 85:
        lines.append("做得很棒！下次可以挑战稍快的速度。")
    else:
        lines.append("建议：慢速 + 节拍器 + 分段练习，练熟后再合起来。")

    return "\n".join(lines)


async def answer_follow_up(question: str, context: str | None = None) -> str:
    if is_google_configured():
        system = (
            "你是一位温柔、鼓励型的长笛老师，面向 6–15 岁学生与零基础成人。"
            "用简单中文回答，每次 3-5 句，给出具体可操作的练习建议。"
        )
        user_content = question
        if context:
            user_content = f"背景：{context}\n\n问题：{question}"

        answer = await generate_text(user_content, system=system)
        if answer:
            return answer

    return (
        f"关于「{question}」：先放慢速度，用节拍器从 {format_tempo_mark(60, 'quarter')} 开始练。"
        "每次只练一个小节，确保音准和节奏都对，再连起来。"
        "如果还是不确定，可以录一段发给我再分析哦！"
    )
