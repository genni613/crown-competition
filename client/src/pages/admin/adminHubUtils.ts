import type { SeasonMember } from '../../types/models'

export interface SeasonMemberSummary {
  total: number
  productCount: number
  designCount: number
  techCount: number
  configuredRoleCount: number
  missingRoleCount: number
  missingSubRoleCount: number
  clientCount: number
  frontendCount: number
  backendCount: number
}

export function summarizeSeasonMembers(members: SeasonMember[]): SeasonMemberSummary {
  const productCount = members.filter(member => member.job_role === 'product').length
  const designCount = members.filter(member => member.job_role === 'design').length
  const techCount = members.filter(member => member.job_role === 'tech').length
  const configuredRoleCount = members.filter(member => member.job_role).length
  const missingRoleCount = members.length - configuredRoleCount
  const missingSubRoleCount = members.filter(member => member.job_role === 'tech' && !member.sub_role).length

  return {
    total: members.length,
    productCount,
    designCount,
    techCount,
    configuredRoleCount,
    missingRoleCount,
    missingSubRoleCount,
    clientCount: members.filter(member => member.sub_role === 'client').length,
    frontendCount: members.filter(member => member.sub_role === 'frontend').length,
    backendCount: members.filter(member => member.sub_role === 'backend').length,
  }
}
