import { db as _db, pool as _pool } from "@db";
import {
  eq as _eq,
  and as _and,
  desc as _desc,
  sql as _sql,
  count as _count,
  asc as _asc,
  inArray as _inArray,
} from "drizzle-orm";
import {
  users as _users,
  badges as _badges,
  userOrganizationScope as _userOrganizationScope,
  metrics as _metrics,
  badgeMetrics as _badgeMetrics,
  achievements as _achievements, // new name for awardedBadges
  progress as _progress, // new name for badgeProgress
  badgePrerequisites as _badgePrerequisites,
  type Badge as _Badge,
  type BadgeCategory as _BadgeCategory,
  type Achievement as _Achievement, // renamed from AwardedBadge
  type Progress as _Progress, // renamed from BadgeProgress
  type Metric as _Metric,
  type UserOrganization as _UserOrganization,
  type UserOrganizationScope as _UserOrganizationScope,
  type InsertBadge as _InsertBadge,
  type InsertAwardedBadge as _InsertAwardedBadge,
  // For backward compatibility
  awardedBadges as _awardedBadges,
  badgeProgress as _badgeProgress,
  type AwardedBadge as _AwardedBadge,
  type BadgeProgress as _BadgeProgress,
} from "@shared/schema";
