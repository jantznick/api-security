import { BadRequestException, Body, Controller, Post } from '@nestjs/common';

@Controller('api/auth')
export class AuthController {
  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    const { email, password } = body || {};
    if (!email || !password) {
      throw new BadRequestException('email and password required');
    }
    return {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature',
      user: { email },
    };
  }
}
