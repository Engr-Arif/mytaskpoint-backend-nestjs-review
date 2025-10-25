import { Injectable, NotFoundException } from '@nestjs/common';
import { OtpAlreadySentException } from '../common/exceptions/otp-already-sent.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class OtpService {
  private readonly OTP_LENGTH = 4;
  private readonly OTP_EXPIRY_MINUTES = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async generateOtpByWorker(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || !task.phone) {
      throw new NotFoundException('Task or customer phone not found');
    }

    const otp = this.generateOtp();


    await this.prisma.taskOtp.create({
      data: {
        taskId,
        otp,
        expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });


    const brandName = process.env.BRAND_NAME ?? 'MyTechGiant';
    const senderId = process.env.SMS_SENDER_ID ?? 'ApprovedSender';

    await this.smsService.sendOtp(task.phone, otp, brandName, senderId);

    return { success: true, message: 'OTP sent to customer phone' };
  }

  async verifyOtp(taskId: string, otp: string) {
    const taskOtp = await this.prisma.taskOtp.findFirst({
      where: {
        taskId,
        otp,
        verified: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!taskOtp) {
      return { verified: false, message: 'Invalid or expired OTP' };
    }

    await this.prisma.taskOtp.update({
      where: { id: taskOtp.id },
      data: { verified: true },
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed' },
    });

    return { verified: true, message: 'OTP verified, task completed' };
  }


  async generatePasswordResetOtp(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found with this email address');
    }


    if (!user.phone) {
      throw new NotFoundException('No phone number associated with this account');
    }


    const existingOtp = await this.prisma.passwordReset.findFirst({
      where: {
        userId: user.id,
        verified: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (existingOtp) {
      throw new OtpAlreadySentException('An OTP has already been sent. Please wait 10 minutes before requesting another.');
    }


    await this.prisma.passwordReset.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() },
      },
    });

    const otp = this.generateOtp();


    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        email: user.email,
        phone: user.phone,
        otp,
        expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });


    const brandName = process.env.BRAND_NAME ?? 'MyTechGiant';
    const senderId = process.env.SMS_SENDER_ID ?? 'ApprovedSender';

    await this.smsService.sendPasswordResetOtp(user.phone, otp, brandName, senderId);

    return { success: true, message: 'Password reset OTP sent to your registered phone number' };
  }

  async verifyPasswordResetOtp(email: string, otp: string) {
    const passwordReset = await this.prisma.passwordReset.findFirst({
      where: {
        email,
        otp,
        verified: false,
        expiresAt: { gte: new Date() },
      },
      include: { user: true },
    });

    if (!passwordReset) {
      return { verified: false, message: 'Invalid or expired OTP' };
    }

    await this.prisma.passwordReset.update({
      where: { id: passwordReset.id },
      data: { verified: true },
    });

    return {
      verified: true,
      message: 'OTP verified successfully',
      userId: passwordReset.userId
    };
  }
}
