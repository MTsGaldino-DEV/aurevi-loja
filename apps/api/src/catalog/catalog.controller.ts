import { productQuerySchema } from '@aurevi/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { parseOrBadRequest } from '../common/parse.js';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('layout')
  layout() {
    return this.catalog.layout();
  }

  @Get('home')
  home() {
    return this.catalog.home();
  }

  @Get('products')
  products(@Query() query: unknown) {
    return this.catalog.products(parseOrBadRequest(productQuerySchema, query));
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.catalog.product(slug);
  }

  @Get('sitemap')
  sitemap() {
    return this.catalog.sitemap();
  }
}
