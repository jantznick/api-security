import { Controller, Get, Param } from '@nestjs/common';

@Controller('api/orders')
export class OrdersController {
  @Get(':orderId/items/:itemId')
  getItem(@Param('orderId') orderId: string, @Param('itemId') itemId: string) {
    return {
      orderId,
      itemId,
      sku: 'SKU-100',
      qty: 2,
    };
  }
}
