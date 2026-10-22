import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../lang/en-SG.json';
import zhMessages from '../../lang/zh-Hans.json';
import { getCrowdReportDirectionLabel } from './getCrowdReportDirectionLabel';

const EN = createIntl({ locale: 'en-SG', messages: enMessages });
const ZH = createIntl({ locale: 'zh-Hans', messages: zhMessages });
const DIRECTION = {
  directionText: 'towards:BP6',
  directionStation: {
    id: 'BP6',
    name: {
      'en-SG': 'Bukit Panjang',
      'zh-Hans': '武吉班让',
      ms: null,
      ta: null,
    },
  },
};

describe('community report direction label', () => {
  it('uses localized wording and the localized station name', () => {
    expect(getCrowdReportDirectionLabel(DIRECTION, EN)).toBe(
      'Towards Bukit Panjang',
    );
    expect(getCrowdReportDirectionLabel(DIRECTION, ZH)).toBe('前往 武吉班让');
  });

  it('never exposes an unresolved station token', () => {
    expect(
      getCrowdReportDirectionLabel(
        { directionText: 'towards:missing', directionStation: null },
        EN,
      ),
    ).toBe('Not provided');
  });

  it('distinguishes an uncertain direction from a missing one', () => {
    expect(
      getCrowdReportDirectionLabel(
        { directionText: 'not-sure', directionStation: null },
        EN,
      ),
    ).toBe('Not sure');
    expect(
      getCrowdReportDirectionLabel(
        { directionText: null, directionStation: null },
        EN,
      ),
    ).toBe('Not provided');
  });
});
