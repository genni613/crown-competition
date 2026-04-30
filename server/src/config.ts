import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  mysql: {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'crown_competition',
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
  },
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
  },
  copilotkit: {
    model: process.env.COPILOTKIT_MODEL || 'openai/gpt-4o',
    openaiModel: process.env.COPILOTKIT_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o',
    openaiApiKey: process.env.COPILOTKIT_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    openaiBaseUrl: process.env.COPILOTKIT_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || '',
    openaiOrganization:
      process.env.COPILOTKIT_OPENAI_ORGANIZATION || process.env.OPENAI_ORG_ID || '',
    openaiProject: process.env.COPILOTKIT_OPENAI_PROJECT || process.env.OPENAI_PROJECT_ID || '',
    openaiDefaultHeaders: process.env.COPILOTKIT_OPENAI_DEFAULT_HEADERS || '',
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
    projectType: process.env.FEISHU_PROJECT_PROJECT_TYPE || 'project',
    pageSize: parseInt(process.env.FEISHU_PROJECT_PAGE_SIZE || '50', 10),
    workHourType: process.env.FEISHU_PROJECT_WORK_HOUR_TYPE || 'gongshi',
    workHourTypeCandidates: process.env.FEISHU_PROJECT_WORK_HOUR_TYPE_CANDIDATES || '',
    workHourUserField: process.env.FEISHU_PROJECT_WORK_HOUR_USER_FIELD || 'owner',
    workHourHoursField: process.env.FEISHU_PROJECT_WORK_HOUR_HOURS_FIELD || 'field_work_hours',
    workHourDateField: process.env.FEISHU_PROJECT_WORK_HOUR_DATE_FIELD || 'field_11eb9f',
    workHourProjectField: process.env.FEISHU_PROJECT_WORK_HOUR_PROJECT_FIELD || 'field_33cf4d',
    workHourProjectType: process.env.FEISHU_PROJECT_WORK_HOUR_PROJECT_TYPE || '676ba5497a0d2d9faf21b715',
    workHourViewId: process.env.FEISHU_PROJECT_WORK_HOUR_VIEW_ID || '',
  },
  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production-env-!!!',
  },
  siteUrl: process.env.SITE_URL || 'http://localhost:3001',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
} as const
