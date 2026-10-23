/**
 * WebAuthn Biometrics Service (FaceID / Touch ID / Windows Hello / Android Biometrics)
 * Cung cấp đăng nhập và xác thực sinh trắc học 1-chạm bảo mật chuẩn W3C WebAuthn
 */

const STORAGE_KEY_CREDENTIAL_ID = 'so_ghi_no_biometric_cred_id';
const STORAGE_KEY_ENABLED = 'so_ghi_no_biometric_enabled';
const STORAGE_KEY_AUTH_TOKEN = 'so_ghi_no_biometric_auth_payload';

// Chuyển đổi ArrayBuffer sang Base64Url và ngược lại
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer.buffer;
}

/**
 * Kiểm tra xem thiết bị và trình duyệt hiện tại có hỗ trợ FaceID / Vân tay (Platform Authenticator) hay không
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    console.warn('Lỗi kiểm tra sinh trắc học:', err);
    return false;
  }
}

/**
 * Kiểm tra xem người dùng đã từng đăng ký FaceID / Vân tay trên thiết bị này chưa
 */
export function isBiometricsEnrolled(): boolean {
  if (typeof window === 'undefined') return false;
  const isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  const credId = localStorage.getItem(STORAGE_KEY_CREDENTIAL_ID);
  return Boolean(isEnabled && credId);
}

/**
 * Đăng ký FaceID / Touch ID mới cho Chủ Sổ Nợ
 * @param ownerPasscode Mật khẩu PIN của chủ sổ để lưu an toàn cho việc mở khóa phiên
 */
export async function registerBiometrics(
  ownerPasscode: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const available = await isBiometricsAvailable();
    if (!available) {
      return {
        success: false,
        message: 'Thiết bị hoặc trình duyệt của bạn không hỗ trợ FaceID / Vân tay.',
      };
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const rpId = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'Sổ Ghi Nợ',
        id: rpId,
      },
      user: {
        id: userId,
        name: 'owner@soghino.local',
        displayName: 'Chủ Sổ Ghi Nợ',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Bắt buộc dùng FaceID / Touch ID / Vân tay của chính thiết bị
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return {
        success: false,
        message: 'Không nhận được xác thực FaceID từ thiết bị.',
      };
    }

    const credIdBase64 = bufferToBase64Url(credential.rawId);
    localStorage.setItem(STORAGE_KEY_CREDENTIAL_ID, credIdBase64);
    localStorage.setItem(STORAGE_KEY_ENABLED, 'true');

    // Lưu mã xác thực đã mã hóa đơn giản để mở khóa phiên Chủ Nợ
    if (ownerPasscode) {
      const payload = btoa(encodeURIComponent(ownerPasscode));
      localStorage.setItem(STORAGE_KEY_AUTH_TOKEN, payload);
    }

    return {
      success: true,
      message: 'Kích hoạt FaceID / Vân tay thành công!',
    };
  } catch (err: any) {
    console.warn('Lỗi đăng ký FaceID:', err);
    if (err?.name === 'NotAllowedError') {
      return {
        success: false,
        message: 'Bạn đã hủy quét FaceID / Vân tay hoặc thiết bị từ chối quyền truy cập.',
      };
    }
    return {
      success: false,
      message: err?.message || 'Không thể thiết lập FaceID trên thiết bị này.',
    };
  }
}

/**
 * Đăng nhập bằng FaceID / Touch ID
 * Yêu cầu người dùng quét mặt / vân tay trên thiết bị
 */
export async function authenticateWithBiometrics(): Promise<{
  success: boolean;
  passcode?: string;
  message?: string;
}> {
  try {
    const credIdBase64 = localStorage.getItem(STORAGE_KEY_CREDENTIAL_ID);
    if (!credIdBase64) {
      return {
        success: false,
        message: 'Chưa có FaceID nào được liên kết với ứng dụng trên thiết bị này.',
      };
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const rpId = window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname;

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId,
      allowCredentials: [
        {
          id: base64UrlToBuffer(credIdBase64),
          type: 'public-key',
          transports: ['internal'],
        },
      ],
      userVerification: 'required', // Bắt buộc FaceID/TouchID thật
      timeout: 60000,
    };

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      return {
        success: false,
        message: 'Xác thực sinh trắc học không thành công.',
      };
    }

    // Lấy lại passcode đã lưu trữ để hoàn tất đăng nhập phiên Chủ Nợ
    const payload = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
    let recoveredPasscode = '';
    if (payload) {
      try {
        recoveredPasscode = decodeURIComponent(atob(payload));
      } catch {
        recoveredPasscode = '';
      }
    }

    return {
      success: true,
      passcode: recoveredPasscode,
      message: 'Xác thực FaceID thành công!',
    };
  } catch (err: any) {
    console.warn('Lỗi xác thực FaceID:', err);
    if (err?.name === 'NotAllowedError') {
      return {
        success: false,
        message: 'Quét FaceID bị hủy hoặc không khớp khuôn mặt/vân tay.',
      };
    }
    return {
      success: false,
      message: err?.message || 'Lỗi quét FaceID / Vân tay.',
    };
  }
}

/**
 * Hủy liên kết FaceID / Vân tay
 */
export function disableBiometrics(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_CREDENTIAL_ID);
  localStorage.removeItem(STORAGE_KEY_ENABLED);
  localStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
}
