/* Hub page entry — wires boot sequence and card navigation. Boot owns its
   own DOM setup (side-effectful import); cards need the boot-active predicate
   so arrow/Enter shortcuts stay dormant until boot finishes. */

import { isBootActive } from './boot';
import { initCardNav } from './cards';

initCardNav(isBootActive);
