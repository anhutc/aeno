/**
 * Tiện ích phản hồi xúc giác (Haptic Feedback) chuẩn iOS
 * Cung cấp cảm giác rung nhẹ vật lý khi người dùng tương tác trên thiết bị di động
 */

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error';

export const triggerHaptic = (type: HapticType = 'light'): void => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  try {
    if ('vibrate' in navigator) {
      switch (type) {
        case 'selection':
          navigator.vibrate(6);
          break;
        case 'light':
          navigator.vibrate(10);
          break;
        case 'medium':
          navigator.vibrate(18);
          break;
        case 'heavy':
          navigator.vibrate(28);
          break;
        case 'success':
          navigator.vibrate([10, 40, 15]);
          break;
        case 'warning':
          navigator.vibrate([20, 50, 20]);
          break;
        case 'error':
          navigator.vibrate([30, 50, 30, 50, 30]);
          break;
        default:
          navigator.vibrate(10);
      }
    }
  } catch {
    // Ignore environments where vibrate is restricted or disabled
  }
};
