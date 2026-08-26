import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';

type User = { id: number; email?: string; name?: string; phone?: string };

const users: User[] = [
  { id: 1, email: 'alice@example.com', name: 'Alice', phone: '555-0100' },
  { id: 2, email: 'bob@example.com', name: 'Bob', phone: '555-0101' },
];

@Controller('api/users')
export class UsersController {
  @Get()
  list() {
    return { users };
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const user = users.find((u) => String(u.id) === String(id));
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { user };
  }

  @Post()
  create(
    @Body()
    body: {
      email?: string;
      name?: string;
      phone?: string;
      password?: string;
      ssn?: string;
    },
  ) {
    const { email, name, phone, password, ssn } = body || {};
    const user = {
      id: users.length + 1,
      email,
      name,
      phone,
      // Echo shape only for discovery demo — do not do this in real apps
      hasPassword: Boolean(password),
      hasSsn: Boolean(ssn),
    };
    users.push({ id: user.id, email, name, phone });
    return { user };
  }
}
