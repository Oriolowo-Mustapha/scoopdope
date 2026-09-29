import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { SurveyResponse } from './survey-response.entity';

@Injectable()
export class SurveysService {
  constructor(
    @InjectRepository(Survey)
    private surveyRepo: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private questionRepo: Repository<SurveyQuestion>,
    @InjectRepository(SurveyResponse)
    private responseRepo: Repository<SurveyResponse>,
  ) {}

  async createSurvey(
    courseId: string,
    title: string,
    description: string,
    triggerType: 'completion' | 'milestone',
    triggerMilestone?: number,
    allowAnonymous = false,
  ): Promise<Survey> {
    const survey = this.surveyRepo.create({
      courseId,
      title,
      description,
      triggerType,
      triggerMilestone,
      allowAnonymous,
    });
    return this.surveyRepo.save(survey);
  }

  /** Auto-create a default NPS + open-ended survey for a course on completion */
  async createCompletionSurvey(courseId: string, courseTitle: string): Promise<Survey> {
    const existing = await this.surveyRepo.findOne({
      where: { courseId, triggerType: 'completion', isActive: true },
    });
    if (existing) return existing;

    const survey = await this.createSurvey(
      courseId,
      `${courseTitle} — Feedback`,
      'Help us improve this course with your feedback.',
      'completion',
      undefined,
      true,
    );

    await this.addQuestion(survey.id, 'How likely are you to recommend this course? (0–10)', 'rating', 1, undefined, true);
    await this.addQuestion(survey.id, 'What did you enjoy most about this course?', 'text', 2, undefined, false);
    await this.addQuestion(survey.id, 'What could be improved?', 'text', 3, undefined, false);

    return survey;
  }

  async addQuestion(
    surveyId: string,
    text: string,
    type: 'rating' | 'text' | 'mcq',
    order: number,
    options?: string[],
    required = true,
  ): Promise<SurveyQuestion> {
    const question = this.questionRepo.create({
      surveyId,
      text,
      type,
      order,
      options,
      required,
    });
    return this.questionRepo.save(question);
  }

  async submitResponse(
    surveyId: string,
    userId: string,
    answers: Record<string, string | number>,
    isAnonymous = false,
  ): Promise<SurveyResponse> {
    const survey = await this.surveyRepo.findOne({ where: { id: surveyId } });
    const response = this.responseRepo.create({
      surveyId,
      userId: survey?.allowAnonymous && isAnonymous ? 'anonymous' : userId,
      answers,
      isAnonymous: survey?.allowAnonymous ? isAnonymous : false,
    });
    return this.responseRepo.save(response);
  }

  async getSurveyByCourse(courseId: string): Promise<Survey[]> {
    return this.surveyRepo.find({
      where: { courseId, isActive: true },
      relations: ['questions'],
      order: { createdAt: 'DESC' },
    });
  }

  async getResponsesForSurvey(surveyId: string): Promise<SurveyResponse[]> {
    return this.responseRepo.find({
      where: { surveyId },
      relations: ['user'],
    });
  }

  async getAnalytics(surveyId: string): Promise<{
    totalResponses: number;
    npsScore: number | null;
    questionStats: Record<string, any>;
  }> {
    const survey = await this.surveyRepo.findOne({
      where: { id: surveyId },
      relations: ['responses', 'questions'],
    });

    if (!survey) throw new Error('Survey not found');

    const totalResponses = survey.responses.length;
    const questionStats: Record<string, any> = {};
    let npsScore: number | null = null;

    for (const question of survey.questions) {
      const responses = survey.responses.map((r) => r.answers[question.id]);

      if (question.type === 'rating') {
        const ratings = responses.filter((r) => typeof r === 'number') as number[];
        const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b) / ratings.length : 0;
        questionStats[question.id] = { average: avg, count: ratings.length };

        // NPS: first rating question with 0-10 scale
        if (npsScore === null && ratings.length > 0) {
          const promoters = ratings.filter((r) => r >= 9).length;
          const detractors = ratings.filter((r) => r <= 6).length;
          npsScore = Math.round(((promoters - detractors) / ratings.length) * 100);
        }
      } else if (question.type === 'mcq') {
        const counts: Record<string, number> = {};
        responses.forEach((r) => {
          if (r) counts[String(r)] = (counts[String(r)] || 0) + 1;
        });
        questionStats[question.id] = counts;
      } else {
        questionStats[question.id] = { responses: responses.filter((r) => r) };
      }
    }

    return { totalResponses, npsScore, questionStats };
  }

  /** Aggregate survey results across all courses for an instructor */
  async getInstructorSurveyAggregate(instructorId: string): Promise<{
    courseId: string;
    surveyId: string;
    title: string;
    totalResponses: number;
    npsScore: number | null;
  }[]> {
    const surveys = await this.surveyRepo.find({
      where: { isActive: true, course: { instructorId } },
      relations: ['course', 'responses', 'questions'],
    });

    return surveys.map((survey) => {
      const ratingQuestion = survey.questions.find((question) => question.type === 'rating');
      const ratings = survey.responses
        .map((response) => ratingQuestion && response.answers[ratingQuestion.id])
        .filter((rating): rating is number => typeof rating === 'number');

      const promoters = ratings.filter((rating) => rating >= 9).length;
      const detractors = ratings.filter((rating) => rating <= 6).length;

      return {
        courseId: survey.courseId,
        surveyId: survey.id,
        title: survey.title,
        totalResponses: survey.responses.length,
        npsScore:
          ratings.length > 0
            ? Math.round(((promoters - detractors) / ratings.length) * 100)
            : null,
      };
    });
  }
}
