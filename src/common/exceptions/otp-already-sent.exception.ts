import { HttpException } from '@nestjs/common';

export class OtpAlreadySentException extends HttpException {
  constructor(
    message: string = 'An OTP has already been sent. Please wait 10 minutes before requesting another.'
  ) {
    super(
      {
        statusCode: 407,
        error: 'Proxy Authentication Required',
        message: [message],
      },
      407
    );
  }
}
