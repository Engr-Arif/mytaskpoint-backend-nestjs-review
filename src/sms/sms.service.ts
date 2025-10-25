import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import * as qs from 'qs';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly apiKey = process.env.SMS_API_KEY;
  private readonly apiUrl =
    process.env.SMS_API_URL || 'https://sms-provider.example.com/send';

  constructor(private readonly httpService: HttpService) {}

  async sendSms(number: string, message: string, senderId: string) {
    try {
      const payload = qs.stringify({
        api_key: this.apiKey,
        senderid: senderId,
        number,
        message,
      });

      const response = await lastValueFrom(
        this.httpService.post(this.apiUrl, payload, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      this.logger.log(
        `SMS sent successfully to ${number}. Response: ${JSON.stringify(response.data)}`
      );
      return response.data;
    } catch (error) {
      this.logger.error(`SMS sending failed to ${number}`, error);
      throw error;
    }
  }

  async sendOtp(
    number: string,
    otp: string,
    brandName: string,
    senderId: string
  ) {
    const message = `প্রিয় গ্রাহক,পণ্য বুঝে পেয়ে OTP ${otp} ডেলিভারি ম্যানকে দিন।`;

    return this.sendSms(number, message, senderId);
  }

  async sendPasswordResetOtp(
    number: string,
    otp: string,
    brandName: string,
    senderId: string
  ) {
    const message = `Your password reset OTP is ${otp}. This OTP will expire in 10 minutes. Do not share this OTP with anyone.`;

    return this.sendSms(number, message, senderId);
  }
}
