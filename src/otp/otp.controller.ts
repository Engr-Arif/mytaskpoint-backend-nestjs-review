import { Controller, Post, Body } from '@nestjs/common';
import { OtpService } from './otp.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('generate')
  async generate(@Body() body: { taskId: string }) {
    return this.otpService.generateOtpByWorker(body.taskId);
  }

  @Post('verify')
  async verify(@Body() body: { taskId: string; otp: string }) {
    return this.otpService.verifyOtp(body.taskId, body.otp);
  }
}
