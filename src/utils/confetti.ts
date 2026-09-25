import confetti from 'canvas-confetti';

/**
 * Bắn pháo hoa ăn mừng khi một người trả hết nợ hoặc hoàn thành tất toán
 */
export const triggerSettledCelebration = () => {
  try {
    // Đợt 1: Bắn tung hoa từ giữa màn hình
    confetti({
      particleCount: 90,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#10b981', '#14b8a6', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6'],
      zIndex: 99999,
    });

    // Đợt 2: Hai bên hông bắn chéo sang nhau
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 60,
        origin: { x: 0.05, y: 0.7 },
        colors: ['#10b981', '#34d399', '#f59e0b', '#fbbf24'],
        zIndex: 99999,
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 60,
        origin: { x: 0.95, y: 0.7 },
        colors: ['#06b6d4', '#38bdf8', '#ec4899', '#f472b6'],
        zIndex: 99999,
      });
    }, 250);
  } catch (e) {
    console.error('Confetti error:', e);
  }
};

/**
 * Đại tiệc pháo hoa ăn mừng hoành tráng (khi tất toán toàn bộ sổ hoặc ngày thu nợ thành công)
 */
export const triggerGrandCelebration = () => {
  try {
    const duration = 2000;
    const animationEnd = Date.now() + duration;

    const interval: any = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      const particleCount = 40 * (timeLeft / duration);
      confetti({
        particleCount,
        spread: 360,
        startVelocity: 30,
        ticks: 60,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
        colors: ['#10b981', '#059669', '#34d399', '#f59e0b', '#fbbf24', '#06b6d4'],
        zIndex: 99999,
      });
    }, 200);
  } catch (e) {
    console.error('Grand confetti error:', e);
  }
};
