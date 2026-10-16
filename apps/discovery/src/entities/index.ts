import { SearchBranch } from './search-branch.entity';
import { SearchCategory } from './search-category.entity';
import { SearchMedia } from './search-media.entity';
import { SearchProduct } from './search-product.entity';

export * from './search-branch.entity';
export * from './search-category.entity';
export * from './search-media.entity';
export * from './search-product.entity';

/** The discovery service's read model: rebuilt from the owners' events, never edited directly. */
export const entities = [SearchBranch, SearchProduct, SearchCategory, SearchMedia];
