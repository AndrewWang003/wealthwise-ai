/**
 * @fileOverview Global Throttle Manager (Singleton Pattern)
 * 
 * 🛡️ 方案 C: 在内存中维护节流状态，作为额外的保险层
 * 
 * 功能:
 * - 跨组件共享节流状态（即使组件卸载/重载也不会重置）
 * - 区分手动和自动刷新的冷却期
 * - 提供详细的剩余时间反馈
 */

interface ThrottleState {
  lastRefreshAt: number;
  cooldownMs: number;
}

class ThrottleManager {
  private refreshMap = new Map<string, ThrottleState>();
  
  // 冷却期配置
  private readonly MANUAL_COOLDOWN = 5 * 60 * 1000; // 5 分钟
  private readonly AUTO_COOLDOWN = 60 * 60 * 1000;  // 1 小时
  
  /**
   * 检查是否允许刷新
   * @param userId 用户 ID
   * @param isManual 是否为手动刷新
   * @returns 是否允许刷新
   */
  canRefresh(userId: string, isManual: boolean): boolean {
    const key = `${userId}:${isManual ? 'manual' : 'auto'}`;
    const state = this.refreshMap.get(key);
    
    if (!state) {
      console.log(`[ThrottleManager] First refresh for ${key}, allowing`);
      return true;
    }
    
    const elapsed = Date.now() - state.lastRefreshAt;
    const cooldown = isManual ? this.MANUAL_COOLDOWN : this.AUTO_COOLDOWN;
    
    if (elapsed < cooldown) {
      const remaining = Math.ceil((cooldown - elapsed) / 1000);
      console.log(`[ThrottleManager] ⏳ ${key} throttled: ${Math.ceil(remaining / 60)} mins remaining`);
      return false;
    }
    
    console.log(`[ThrottleManager] ✅ ${key} cooldown elapsed, allowing`);
    return true;
  }
  
  /**
   * 记录刷新时间（在成功调用 API 后调用）
   * @param userId 用户 ID
   * @param isManual 是否为手动刷新
   */
  recordRefresh(userId: string, isManual: boolean): void {
    const key = `${userId}:${isManual ? 'manual' : 'auto'}`;
    const cooldown = isManual ? this.MANUAL_COOLDOWN : this.AUTO_COOLDOWN;
    
    this.refreshMap.set(key, {
      lastRefreshAt: Date.now(),
      cooldownMs: cooldown
    });
    
    console.log(`[ThrottleManager] 📝 Recorded refresh for ${key}`);
  }
  
  /**
   * 获取剩余冷却时间（秒）
   * @param userId 用户 ID
   * @param isManual 是否为手动刷新
   * @returns 剩余秒数，如果没有限制则返回 0
   */
  getRemainingSeconds(userId: string, isManual: boolean): number {
    const key = `${userId}:${isManual ? 'manual' : 'auto'}`;
    const state = this.refreshMap.get(key);
    
    if (!state) return 0;
    
    const elapsed = Date.now() - state.lastRefreshAt;
    const cooldown = isManual ? this.MANUAL_COOLDOWN : this.AUTO_COOLDOWN;
    
    if (elapsed >= cooldown) return 0;
    
    return Math.ceil((cooldown - elapsed) / 1000);
  }
  
  /**
   * 清除特定用户的节流状态（用于调试或强制重置）
   * @param userId 用户 ID
   */
  clearUser(userId: string): void {
    this.refreshMap.delete(`${userId}:manual`);
    this.refreshMap.delete(`${userId}:auto`);
    console.log(`[ThrottleManager] 🗑️ Cleared throttle state for user ${userId}`);
  }
}

// 导出单例实例
export const throttleManager = new ThrottleManager();
