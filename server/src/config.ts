import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
  },
  feishuProject: {
    baseUrl: process.env.FEISHU_PROJECT_BASE_URL || 'https://project.feishu.cn',
    pluginId: process.env.FEISHU_PROJECT_PLUGIN_ID || '',
    pluginSecret: process.env.FEISHU_PROJECT_PLUGIN_SECRET || '',
    userKey: process.env.FEISHU_PROJECT_USER_KEY || '',
    projectKey: process.env.FEISHU_PROJECT_KEY || '',
    storyType: process.env.FEISHU_PROJECT_STORY_TYPE || 'story',
    issueType: process.env.FEISHU_PROJECT_ISSUE_TYPE || 'issue',
    defectType: process.env.FEISHU_PROJECT_DEFECT_TYPE || process.env.FEISHU_PROJECT_TASK_TYPE || 'defect',
    pageSize: parseInt(process.env.FEISHU_PROJECT_PAGE_SIZE || '100', 10),
    workHourType: process.env.FEISHU_PROJECT_WORK_HOUR_TYPE || 'gongshi',
    workHourTypeCandidates: process.env.FEISHU_PROJECT_WORK_HOUR_TYPE_CANDIDATES || '',
    workHourUserField: process.env.FEISHU_PROJECT_WORK_HOUR_USER_FIELD || 'owner',
    workHourHoursField: process.env.FEISHU_PROJECT_WORK_HOUR_HOURS_FIELD || 'field_work_hours',
    workHourDateField: process.env.FEISHU_PROJECT_WORK_HOUR_DATE_FIELD || 'created_at',
    workHourProjectField: process.env.FEISHU_PROJECT_WORK_HOUR_PROJECT_FIELD || 'field_33cf4d',
    workHourProjectType: process.env.FEISHU_PROJECT_WORK_HOUR_PROJECT_TYPE || '676ba5497a0d2d9faf21b715',
    workHourViewId: process.env.FEISHU_PROJECT_WORK_HOUR_VIEW_ID || '',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production-env-!!!',
  },
  siteUrl: process.env.SITE_URL || 'http://localhost:3001',
  dbPath: path.resolve(__dirname, '../data/crown.db'),
} as const
