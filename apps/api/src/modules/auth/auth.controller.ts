import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators';

class LoginDto {
  @IsString() @IsNotEmpty() identifier!: string;
  @IsString() @IsNotEmpty() password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.identifier, dto.password).then((data) => ({ data }));
  }

  @Get('me')
  me(@Req() req: any) {
    return { data: req.user };
  }
}
