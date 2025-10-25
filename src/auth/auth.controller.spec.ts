import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from '../otp/otp.service';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dtos';
import { Role } from '../common/enums/role.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let otpService: OtpService;

  const mockAuthService = {
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  const mockOtpService = {
    generatePasswordResetOtp: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: OtpService, useValue: mockOtpService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    otpService = module.get<OtpService>(OtpService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const mockUser = {
        id: 'user-id',
        role: Role.WORKER,
        active: true,
      } as const;
      const changePasswordDto: ChangePasswordDto = {
        oldPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      };

      mockAuthService.changePassword.mockResolvedValue({
        success: true,
        message: 'Password changed successfully',
      });

      const result = await controller.changePassword(
        mockUser,
        changePasswordDto
      );

      expect(authService.changePassword).toHaveBeenCalledWith(
        'user-id',
        'oldPassword123',
        'newPassword123'
      );
      expect(result).toEqual({
        success: true,
        message: 'Password changed successfully',
      });
    });
  });

  describe('forgotPassword', () => {
    it('should send OTP for password reset', async () => {
      const forgotPasswordDto: ForgotPasswordDto = {
        phone: '+8801234567890',
      };

      mockOtpService.generatePasswordResetOtp.mockResolvedValue({
        success: true,
        message: 'OTP sent',
      });
      mockAuthService.forgotPassword.mockResolvedValue({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP',
      });

      const result = await controller.forgotPassword(forgotPasswordDto);

      expect(otpService.generatePasswordResetOtp).toHaveBeenCalledWith(
        '+8801234567890'
      );
      expect(authService.forgotPassword).toHaveBeenCalledWith('+8801234567890');
      expect(result).toEqual({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP',
      });
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid OTP', async () => {
      const resetPasswordDto: ResetPasswordDto = {
        phone: '+8801234567890',
        otp: '1234',
        newPassword: 'newPassword123',
      };

      mockAuthService.resetPassword.mockResolvedValue({
        success: true,
        message: 'Password reset successfully',
      });

      const result = await controller.resetPassword(resetPasswordDto);

      expect(authService.resetPassword).toHaveBeenCalledWith(
        '+8801234567890',
        '1234',
        'newPassword123'
      );
      expect(result).toEqual({
        success: true,
        message: 'Password reset successfully',
      });
    });
  });
});
