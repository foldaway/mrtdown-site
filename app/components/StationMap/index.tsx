import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  IssueStationEntry,
  StationIndex,
  StationTranslatedNames,
} from '~/types';
import { segmentText } from './helpers/segmentText';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useNavigate } from 'react-router';

interface Props {
  stationIdsAffected: IssueStationEntry[];
  componentIdsAffected: string[];
}

export const StationMap: React.FC<Props> = (props) => {
  const { stationIdsAffected, componentIdsAffected } = props;

  const intl = useIntl();
  const navigate = useNavigate();

  const stationIndexQuery = useQuery<StationIndex>({
    queryKey: ['station-index'],
    queryFn: () =>
      fetch(
        'https://data.mrtdown.foldaway.space/product/station_index.json',
      ).then((r) => r.json()),
  });

  const stationTranslatedNamesQuery = useQuery<StationTranslatedNames>({
    queryKey: ['station-translated-names', intl.locale],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.foldaway.space/product/station_names_${intl.locale}.json`,
      ).then((r) => r.json()),
  });

  const stationCodes = useMemo(() => {
    return stationIndexQuery.data ?? {};
  }, [stationIndexQuery.data]);

  const stationTranslatedNames = useMemo(() => {
    return stationTranslatedNamesQuery.data ?? {};
  }, [stationTranslatedNamesQuery.data]);

  const [ref, setRef] = useState<SVGElement | null>(null);

  const stationCount = useMemo(() => {
    const result = new Set<string>();
    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        result.add(stationId);
      }
    }
    return result.size;
  }, [stationIdsAffected]);

  useEffect(() => {
    if (ref == null) {
      return;
    }

    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        let patchedLineCount = 0;

        const stationCodeCount = stationCodes[stationId]?.length ?? 0;

        const lineElements = [
          ...ref.querySelectorAll(`[id^='line_${stationId.toLowerCase()}:']`),
          ...ref.querySelectorAll(`[id$=':${stationId.toLowerCase()}']`),
        ] as SVGGElement[];

        for (const otherStationId of entry.stationIds) {
          if (stationId === otherStationId) {
            continue;
          }

          for (const lineElement of lineElements) {
            switch (lineElement.id) {
              case `line_${stationId.toLowerCase()}:${otherStationId.toLowerCase()}`:
              case `line_${otherStationId.toLowerCase()}:${stationId.toLowerCase()}`: {
                lineElement.style.opacity = '0.3';
                patchedLineCount++;
                break;
              }
            }
          }
        }

        const nodeElement: SVGGElement | null = ref.querySelector(
          `#node_${stationId.toLowerCase()}`,
        );

        const unpatchedLineCount = lineElements.length - patchedLineCount;
        if (unpatchedLineCount === 1 && stationCodeCount === 1) {
          // There is only one unpatched line left, it should be greyed out as the current station is an orphan node
          for (const lineElement of lineElements) {
            lineElement.style.opacity = '0.3';
          }
          patchedLineCount++;
        }

        if (patchedLineCount < lineElements.length) {
          // Patch out component parts

          if (nodeElement != null) {
            for (const componentId of componentIdsAffected) {
              const componentElement: SVGGElement | null =
                nodeElement.querySelector(
                  `[id^='${componentId.toLowerCase()}']`,
                );
              if (componentElement != null) {
                componentElement.style.opacity = '0.3';
              }
            }
          }
          continue;
        }

        if (nodeElement != null) {
          nodeElement.style.opacity = '0.3';
        }
        const labelElement: SVGGElement | null = ref.querySelector(
          `#label_${stationId.toLowerCase()}`,
        );
        if (labelElement != null) {
          labelElement.style.opacity = '0.3';
        }
      }
    }

    const labelsElement: SVGGElement | null = ref.querySelector('#labels');
    if (labelsElement != null) {
      const labelElements = [...labelsElement.querySelectorAll('text')];
      for (const labelElement of labelElements) {
        const stationId = labelElement.id.replace(/^label_/, '').toUpperCase();
        const tspans = [...labelElement.querySelectorAll('tspan')];
        if (!(stationId in stationTranslatedNames)) {
          continue;
        }
        const segments = segmentText(
          stationTranslatedNames[stationId],
          intl.locale,
        );
        for (let i = 0; i < tspans.length; i++) {
          const tspan = tspans[i];
          switch (i) {
            case tspans.length - 1: {
              tspan.textContent = segments.slice(i).join('');
              break;
            }
            default: {
              tspan.textContent = segments[i];
              break;
            }
          }
        }
        labelElement.removeAttribute('fill');
        labelElement.classList.add(
          'fill-gray-800',
          'dark:fill-gray-300',
          'hover:underline',
        );

        // Automatically move into parent <a> tag
        const parentElement = labelElement.parentElement;
        if (parentElement != null && parentElement.tagName !== 'A') {
          const newParentElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'a',
          );
          const href = buildLocaleAwareLink(
            `/stations/${stationId}`,
            intl.locale,
          );
          newParentElement.setAttributeNS(null, 'href', href);
          newParentElement.onclick = (e) => {
            e.preventDefault();
            navigate(href);
          };
          parentElement.removeChild(labelElement);
          newParentElement.appendChild(labelElement);
          parentElement.appendChild(newParentElement);
        }

        // Add title label for native tooltip
        let titleElement = labelElement.querySelector(
          'title',
        ) as SVGTitleElement | null;
        if (titleElement == null) {
          titleElement = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'title',
          );
          labelElement.appendChild(titleElement);
        }
        titleElement.textContent = stationTranslatedNames[stationId];
      }
    }
  }, [
    ref,
    stationIdsAffected,
    componentIdsAffected,
    stationCodes,
    stationTranslatedNames,
    intl.locale,
    navigate,
  ]);

  return (
    <div className="flex flex-col fill-gray-800 dark:fill-gray-50">
      {/* Tailwind Class trappers */}
      <div className="hidden fill-gray-800 stroke-gray-800 dark:fill-gray-300 dark:stroke-gray-300" />
      <svg
        ref={setRef}
        viewBox="0 0 3140 2400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>MRT/LRT System Map</title>
        <g id="Frame 3">
          <g id="line_ccl">
            <path
              id="line_cdt:btn"
              d="M1160 937C1160 937 1121 964 1105 978.5C1089 993 1063 1016 1051 1029.5C1039 1043 1013.5 1073.5 1013.5 1073.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_frr:hlv"
              d="M924.871 1233.87C924.871 1233.87 916.5 1256 911 1271.5C905.5 1287 900.871 1312.87 900.871 1312.87"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_hlv:bnv"
              d="M894.5 1339.5C894.5 1339.5 887 1371 885 1391.5C883 1412 879.971 1447.42 879.971 1447.42"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_bnv:onh"
              d="M878.5 1482C878.5 1482 878.5 1494.5 879.994 1513.5C881.488 1532.5 882.5 1542.5 882.5 1542.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_onh:krg"
              d="M885.936 1569.38C885.936 1569.38 891 1600 892.5 1606C894 1612 900.936 1640.38 900.936 1640.38"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_krg:hpv"
              d="M908.818 1666.97C908.818 1666.97 917 1693 919.5 1699.5C922 1706 931.818 1729.97 931.818 1729.97"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_hpv:ppj"
              d="M946.806 1759.36C946.806 1759.36 953.5 1776.5 959 1784.5C964.5 1792.5 972.657 1808.61 972.657 1808.61"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_ppj:lbd"
              d="M992.389 1837.18C992.389 1837.18 1004.5 1855.5 1011 1864C1017.5 1872.5 1030.39 1887.18 1030.39 1887.18"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_lbd:tlb"
              d="M1057 1916.5C1057 1916.5 1075 1935 1080.5 1940.5C1086 1946 1106.03 1961.79 1106.03 1961.79"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_tlb:hbf"
              d="M1140.59 1988.46C1140.59 1988.46 1168 2006.5 1177.5 2012.5C1187 2018.5 1215.59 2035.46 1215.59 2035.46"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_loop"
              d="M1294.91 2068C1294.91 2068 1371 2095 1401.5 2100C1432 2105 1486.5 2110 1536 2110C1585.5 2110 1643 2100.5 1665.5 2094.5C1688 2088.5 1783.91 2053.94 1783.91 2053.94"
              stroke="#FF9E18"
              stroke-width="9"
              stroke-dasharray="1 15"
            />
            <path
              id="line_mrb:bft"
              d="M1815.41 2037.51C1815.41 2037.51 1843 2024 1859 2014.5C1875 2005 1897.41 1986.45 1897.41 1986.45"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_bft:pmn"
              d="M1940.79 1954.4C1940.79 1954.4 1970.5 1931 1986 1913.5C2001.5 1896 2024 1866.5 2024 1866.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_pmn:nch"
              d="M2052.41 1829.49C2052.41 1829.49 2068.5 1806 2074.5 1795C2080.5 1784 2090.41 1764.49 2090.41 1764.49"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_nch:sdm"
              d="M2106 1732C2106 1732 2115 1713 2119.5 1699C2124 1685 2129.62 1665.06 2129.62 1665.06"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_sdm:mbt"
              d="M2139.05 1636.48C2139.05 1636.48 2144.5 1612.5 2146.5 1600C2148.5 1587.5 2151.8 1564.35 2151.8 1564.35"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_mbt:dkt"
              d="M2155 1536C2155 1536 2158.43 1518 2158.43 1502.5C2158.43 1487 2158.43 1466.81 2158.43 1466.81"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_dkt:pyl"
              d="M2158.02 1439.37C2158.02 1439.37 2154.5 1402.5 2153 1394.5C2151.5 1386.5 2147.02 1351.37 2147.02 1351.37"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_pyl:mps"
              d="M2138.15 1312.94C2138.15 1312.94 2126.5 1270 2123 1262C2119.5 1254 2103.15 1206.94 2103.15 1206.94"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_mps:tsg"
              d="M2085.25 1172.76C2085.25 1172.76 2068.5 1139.5 2063.5 1132C2058.5 1124.5 2038.42 1093.53 2038.42 1093.53"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_tsg:bly"
              d="M2019.45 1067.46C2019.45 1067.46 1996.5 1040 1991 1034C1985.5 1028 1961.8 1005.04 1961.8 1005.04"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_bly:srg"
              d="M1929.77 976.358C1929.77 976.358 1893.5 949 1889 945.5C1884.5 942 1847.28 918.455 1847.28 918.455"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_srg:lrc"
              d="M1773 880.83C1773 880.83 1735 866.5 1728 863.5C1721 860.5 1682 848.83 1682 848.83"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_lrc:bsh"
              d="M1639.96 839.181C1639.96 839.181 1595 833.5 1583.5 832C1572 830.5 1528.7 827.985 1528.7 827.985"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_bsh:mrm"
              d="M1413.61 836.938C1413.61 836.938 1382 843 1374 845C1366 847 1333.5 856 1333.5 856"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_mrm:cdt"
              d="M1290 870.5C1290 870.5 1264.5 881 1255 884.5C1245.5 888 1227 898 1227 898"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_dbg:bbs"
              d="M1678.21 1642.41C1678.21 1642.41 1649 1613.5 1639.5 1603C1630 1592.5 1617 1580 1604.5 1572.5C1592 1565 1577 1566 1577 1566"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <line
              id="line_bbs:epn"
              x1="1706.12"
              y1="1669.88"
              x2="1821.12"
              y2="1784.88"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_epn:pmn"
              d="M2019.5 1868C2019.5 1868 2004 1888 1973.5 1895C1943 1902 1921 1882 1921 1882C1921 1882 1893.5 1856.5 1882.5 1846C1871.5 1835.5 1851 1813.83 1851 1813.83"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_btn:frr"
              d="M987.637 1110.43C987.637 1110.43 968.5 1139.5 960 1156C951.5 1172.5 936.637 1204.43 936.637 1204.43"
              stroke="#FF9E18"
              stroke-width="6"
            />
          </g>
          <g id="line_pglrt">
            <path
              id="line_pgl:cov"
              d="M2275.93 496.489C2275.93 496.489 2282.5 506 2285 512C2287.5 518 2287.93 524 2289 531C2290.07 538 2289 550.5 2289 550.5"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_pgl:smk"
              d="M2201.84 370.217C2201.84 370.217 2203 394 2203.5 399.5C2204 405 2206.5 424.5 2210.5 430C2214.5 435.5 2241.84 464.217 2241.84 464.217"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_smk:tkl"
              x1="2177.41"
              y1="335.586"
              x2="2190.41"
              y2="348.586"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_tkl:pgp"
              x1="2141.75"
              y1="300.615"
              x2="2154.75"
              y2="313.615"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_pgp:smd"
              d="M2082 282.5C2082 282.5 2088 276.5 2090.5 274.5C2093 272.5 2099 269 2106 270.5C2113 272 2118.5 277.5 2118.5 277.5"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_smd:nbg"
              d="M2054 339.5C2054 339.5 2047.5 332 2048 326.5C2048.5 321 2049.56 319.5 2051.03 315.5C2052.5 311.5 2059 305.5 2059 305.5"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_nbg:smg"
              x1="2084.59"
              y1="369.414"
              x2="2076.59"
              y2="361.414"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_smg:stk"
              x1="2117.59"
              y1="403.414"
              x2="2107.59"
              y2="393.414"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_stk:pgl"
              d="M2241.24 462.852C2241.24 462.852 2224 446 2218 440C2212 434 2193.5 428.5 2187.5 427C2181.5 425.5 2148.24 424.851 2148.24 424.851"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_cov:mrd"
              d="M2312.36 600.151C2312.36 600.151 2305 593 2301.5 588.5C2298 584 2293.36 573.151 2293.36 573.151"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_mrd:cre"
              x1="2345.58"
              y1="632.414"
              x2="2334.58"
              y2="621.414"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_cre:riv"
              d="M2411 656.5C2411 656.5 2405.5 662.5 2400.5 665.5C2395.5 668.5 2385.5 668 2380.5 665C2375.5 662 2368.5 655 2368.5 655"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_riv:kdl"
              d="M2439.97 598.356C2439.97 598.356 2443.5 603.5 2445 608C2446.5 612.5 2445.03 620 2442.5 624C2439.97 628 2435 633 2435 633"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_kdl:oas"
              x1="2403.51"
              y1="562.948"
              x2="2417.51"
              y2="576.948"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_oas:dam"
              x1="2368.41"
              y1="527.586"
              x2="2380.41"
              y2="539.586"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_dam:pgl"
              d="M2277.4 498.04C2277.4 498.04 2285 505 2292 508.5C2299 512 2303 512 2312.5 512C2322 512 2336 512 2336 512"
              stroke="#718472"
              stroke-width="4"
            />
          </g>
          <g id="line_sklrt">
            <path
              id="line_skg:cgl"
              d="M2044.89 530.339L2044.89 556.5C2044.89 556.5 2046 577 2050.5 586.5C2055 596 2072.89 610.339 2072.89 610.339"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_cgl:fmw"
              x1="2018.41"
              y1="494.586"
              x2="2030.41"
              y2="506.586"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_fmw:kpg"
              x1="1983.41"
              y1="460.586"
              x2="1995.41"
              y2="472.586"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_kpg:tng"
              d="M1934.68 429.118C1934.68 429.118 1943.5 426.736 1949.5 429.118C1955.5 431.5 1961.5 438 1961.5 438"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_tng:fnv"
              d="M1901.84 460.369L1911 453"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_fnv:lyr"
              d="M1897.17 501.812C1897.17 501.812 1893.5 497 1891.5 493C1889.5 489 1889.17 483.812 1889.17 483.812"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_lyr:tkg"
              x1="1920.41"
              y1="525.586"
              x2="1931.41"
              y2="536.586"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_tkg:rnj"
              x1="1953.41"
              y1="557.586"
              x2="1964.41"
              y2="568.586"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_rnj:skg"
              d="M1995.63 583.103C1995.63 583.103 2017 584 2023.5 585C2030 586 2042.5 588 2047.5 591.5C2052.5 595 2070.63 608.103 2070.63 608.103"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_skg:cpv"
              d="M2105.67 647.114C2105.67 647.114 2130.5 666.5 2141 668.5C2151.5 670.5 2170.5 668.5 2182 670.5C2193.5 672.5 2210.67 684.114 2210.67 684.114"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_cpv:rmb"
              x1="2233.31"
              y1="710.451"
              x2="2247.31"
              y2="724.451"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_rmb:bak"
              d="M2272.22 747.737C2272.22 747.737 2281 755 2284 760.5C2287 766 2288 769 2287 777C2286 785 2276.99 791.784 2276.99 791.784"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_bak:kgk"
              d="M2251.5 815.5C2251.5 815.5 2247.5 823 2237.5 826C2227.5 829 2220 822.5 2217 820C2214 817.5 2202.5 806 2202.5 806"
              stroke="#718472"
              stroke-width="4"
            />
            <line
              id="line_kgk:rng"
              x1="2178.59"
              y1="782.414"
              x2="2159.59"
              y2="763.414"
              stroke="#718472"
              stroke-width="4"
            />
            <path
              id="line_rng:skg"
              d="M2138.12 740.68C2138.12 740.68 2131 724.5 2130 714C2129 703.5 2130 683.5 2127.5 674.5C2125 665.5 2104.12 646.68 2104.12 646.68"
              stroke="#718472"
              stroke-width="4"
            />
          </g>
          <g id="line_tel">
            <line
              id="line_wdn:wdl"
              x1="754.17"
              y1="293.929"
              x2="817.17"
              y2="359.929"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_wdl:wds"
              x1="853.187"
              y1="396.946"
              x2="884.187"
              y2="429.946"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_wds:spl"
              x1="912.185"
              y1="458.944"
              x2="944.185"
              y2="492.944"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_spl:ltr"
              x1="973.185"
              y1="522.944"
              x2="1005.18"
              y2="556.944"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_ltr:mfl"
              x1="1034.18"
              y1="586.944"
              x2="1066.18"
              y2="620.944"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_mfl:brh"
              x1="1094.18"
              y1="649.944"
              x2="1126.18"
              y2="683.944"
              stroke="#9D5918"
              stroke-width="6"
            />
            <path
              id="line_brh:uts"
              d="M1154.66 713.608C1154.66 713.608 1171 729 1178 735.5C1185 742 1190.34 755 1194 763C1197.66 771 1197.5 799 1197.5 799"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_uts:cdt"
              x1="1196"
              y1="826"
              x2="1196"
              y2="900"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_cdt:stv"
              x1="1198"
              y1="934"
              x2="1198"
              y2="1075"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_stv:npr"
              x1="1197"
              y1="1110"
              x2="1197"
              y2="1163"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_npr:obv"
              x1="1197"
              y1="1189"
              x2="1197"
              y2="1241"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_obv:orc"
              x1="1197"
              y1="1267"
              x2="1197"
              y2="1314"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_orc:grw"
              x1="1197"
              y1="1349"
              x2="1197"
              y2="1413"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_grw:hvl"
              x1="1197"
              y1="1440"
              x2="1197"
              y2="1506"
              stroke="#9D5918"
              stroke-width="6"
            />
            <path
              id="line_hvl:otp"
              d="M1196.59 1531.48C1196.59 1531.48 1196.59 1605.5 1196.59 1616.5C1196.59 1627.5 1201 1632.5 1206.5 1640.5C1212 1648.5 1222.5 1659 1222.5 1659L1340.59 1776.48"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_otp:max"
              x1="1375.12"
              y1="1810.88"
              x2="1399.12"
              y2="1834.88"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_max:shw"
              x1="1428.12"
              y1="1863.88"
              x2="1548.12"
              y2="1983.88"
              stroke="#9D5918"
              stroke-width="6"
            />
            <path
              id="line_shw:mrb"
              d="M1577.08 2013.2C1577.08 2013.2 1591.5 2027 1597.5 2031C1603.5 2035 1615.5 2039.8 1622 2041C1628.5 2042.2 1652.08 2042.2 1652.08 2042.2"
              stroke="#9D5918"
              stroke-width="6"
            />
            <path
              id="line_mrb:grb"
              d="M1817.36 2041.89L2011 2041.89C2011 2041.89 2030 2043 2042.5 2038.5C2055 2034 2064.5 2026.5 2064.5 2026.5L2114.36 1977.07"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_grb:trh"
              x1="2141.87"
              y1="1947.89"
              x2="2264.95"
              y2="1823.89"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_trh:ktp"
              x1="2295.88"
              y1="1792.84"
              x2="2325.88"
              y2="1762.88"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_ktp:tkt"
              x1="2354.89"
              y1="1732.71"
              x2="2385.02"
              y2="1702.87"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_tkt:mpr"
              x1="2416.49"
              y1="1671.88"
              x2="2446.75"
              y2="1642.18"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_mpr:mtc"
              x1="2478.37"
              y1="1610.34"
              x2="2508.75"
              y2="1580.76"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_mtc:sgl"
              x1="2540.5"
              y1="1549.06"
              x2="2571.01"
              y2="1519.61"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_sgl:bsr"
              x1="2601.85"
              y1="1487.1"
              x2="2623.87"
              y2="1464.89"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_bsr:bds"
              x1="2654.49"
              y1="1434.38"
              x2="2680.87"
              y2="1407.88"
              stroke="#9D5918"
              stroke-width="6"
            />
            <line
              id="line_bds:sgb"
              x1="2710.94"
              y1="1377.48"
              x2="2752.89"
              y2="1335.87"
              stroke="#9D5918"
              stroke-width="6"
            />
          </g>
          <g id="line_nel">
            <line
              id="line_pgl:pgc"
              x1="2273.12"
              y1="440.121"
              x2="2249.12"
              y2="464.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_skg:pgl"
              x1="2211.12"
              y1="502.121"
              x2="2102.12"
              y2="611.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_bgk:skg"
              x1="2065.12"
              y1="648.121"
              x2="2034.12"
              y2="679.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_hgn:bgk"
              x1="2005.12"
              y1="708.121"
              x2="1971.12"
              y2="742.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_kvn:hgn"
              x1="1941.12"
              y1="772.121"
              x2="1905.12"
              y2="808.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_ser:kvn"
              x1="1875.12"
              y1="838.121"
              x2="1833.12"
              y2="880.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_wlh:ser"
              x1="1795.12"
              y1="918.121"
              x2="1735.12"
              y2="978.121"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_ptp:wlh"
              x1="1706.12"
              y1="1007.12"
              x2="1646.12"
              y2="1067.12"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <path
              id="line_bnk:ptp"
              d="M1617.51 1095.64L1595 1119C1595 1119 1584.5 1130 1581.5 1137C1578.5 1144 1576 1163 1576 1163"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_frp:bnk"
              x1="1576"
              y1="1191"
              x2="1576"
              y2="1257"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_lti:frp"
              x1="1576"
              y1="1282"
              x2="1576"
              y2="1349"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <path
              id="line_dbg:lti"
              d="M1575.98 1384.38C1575.98 1384.38 1575.98 1502.5 1575.98 1506.5C1575.98 1510.5 1573 1521 1569 1527.5C1565 1534 1554.98 1547.38 1554.98 1547.38"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_crq:dbg"
              x1="1516.78"
              y1="1583.12"
              x2="1456.78"
              y2="1643.12"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_ctn:crq"
              x1="1427.78"
              y1="1672.12"
              x2="1402.78"
              y2="1697.12"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <line
              id="line_otp:ctn"
              x1="1365.78"
              y1="1735.12"
              x2="1325.78"
              y2="1775.12"
              stroke="#9E28B5"
              stroke-width="6"
            />
            <path
              id="line_hbf:otp"
              d="M1286.6 1812.58C1286.6 1812.58 1259.5 1839.5 1256 1843.5C1252.5 1847.5 1249 1854 1245 1863C1241 1872 1241.94 1886.5 1241.94 1886.5L1241.94 2038.58"
              stroke="#9E28B5"
              stroke-width="6"
            />
          </g>
          <g id="lines">
            <g id="line_dtl">
              <line
                id="line_bkp:csw"
                x1="743"
                y1="730"
                x2="743"
                y2="753"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_csw:hvw"
                x1="743"
                y1="780"
                x2="743"
                y2="803"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_hvw:hme"
                x1="743"
                y1="830"
                x2="743"
                y2="853"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_hme:btw"
                x1="743"
                y1="880"
                x2="743"
                y2="903"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_btw:kap"
                x1="743"
                y1="930"
                x2="743"
                y2="953"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_kap:sav"
                x1="743"
                y1="981"
                x2="743"
                y2="1004"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_sav:tkk"
                d="M741.888 1028.67C741.888 1028.67 744.5 1050.5 755.5 1066C766.5 1081.5 777.5 1085.33 787 1089C796.5 1092.67 820.888 1092.67 820.888 1092.67"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_tkk:btn"
                x1="866"
                y1="1091"
                x2="944"
                y2="1091"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_btn:stv"
                x1="1055"
                y1="1091"
                x2="1143"
                y2="1091"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_stv:new"
                d="M1253.44 1091.37C1253.44 1091.37 1277.5 1090 1293 1094.5C1308.5 1099 1326 1114 1331 1120C1336 1126 1361.44 1150.37 1361.44 1150.37"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_new:lti"
                x1="1374.12"
                y1="1162.87"
                x2="1559.12"
                y2="1346.87"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_lti:rcr"
                x1="1594.09"
                y1="1382.84"
                x2="1656.09"
                y2="1442.84"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_rcr:bgs"
                x1="1685.12"
                y1="1471.88"
                x2="1828.12"
                y2="1614.88"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_bgs:pmn"
                d="M1866.34 1652.12L1988 1773C1988 1773 2002 1790.5 2003.5 1803C2005 1815.5 2003.5 1829.5 2003.5 1829.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_pmn:bft"
                d="M1985.5 1867.5C1985.5 1867.5 1974 1882 1966 1892C1958 1902 1904.15 1952.1 1904.15 1952.1"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_bft:dtn"
                d="M1848 1990C1848 1990 1831.5 1997 1822.5 1999.5C1813.5 2002 1793.61 2002.94 1793.61 2002.94"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_dtn:tla"
                d="M1746.5 2003C1746.5 2003 1719 2003.82 1710 2001C1701 1998.18 1687 1991.5 1682 1987.5C1677 1983.5 1601.38 1910.52 1601.38 1910.52"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_tla:ctn"
                x1="1571.91"
                y1="1881.15"
                x2="1420.91"
                y2="1734.15"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_ctn:fcn"
                d="M1381.5 1696C1381.5 1696 1363 1681 1360 1674.5C1357 1668 1352.5 1655 1354 1647.5C1355.5 1640 1365.06 1622.62 1365.06 1622.62"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_fcn:bcl"
                d="M1706.15 1594C1706.15 1594 1694 1600 1682 1605.5C1670 1611 1624.5 1609 1624.5 1609L1407.5 1607.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_bcl:jlb"
                x1="1784.12"
                y1="1514.8"
                x2="1734.12"
                y2="1564.8"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_jlb:bdm"
                x1="1884.13"
                y1="1415.11"
                x2="1810.13"
                y2="1489.73"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_bdm:glb"
                x1="1953.81"
                y1="1346.12"
                x2="1912.81"
                y2="1387.12"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_glb:mtr"
                x1="2024.73"
                y1="1274.92"
                x2="1981.73"
                y2="1317.92"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_mtr:mps"
                x1="2090.96"
                y1="1209.01"
                x2="2052.96"
                y2="1247.01"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_mps:ubi"
                x1="2172.18"
                y1="1128.1"
                x2="2129.18"
                y2="1171.1"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_ubi:kkb"
                x1="2249.4"
                y1="1051.19"
                x2="2200.4"
                y2="1100.19"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_kkb:bdn"
                x1="2318.62"
                y1="982.285"
                x2="2277.62"
                y2="1023.28"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_bdn:bdr"
                d="M2435.48 941.961C2435.48 941.961 2388.5 941.961 2385 941.961C2381.5 941.961 2370 944.5 2366 946C2362 947.5 2349.48 955.961 2349.48 955.961"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_bdr:tpw"
                x1="2564"
                y1="942"
                x2="2483"
                y2="942"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_tpw:tam"
                x1="2729"
                y1="942"
                x2="2610"
                y2="942"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_tam:tpe"
                d="M2843 989C2843 989 2843.5 979.5 2842 975C2840.5 970.5 2838 963 2834 958.5C2830 954 2814 943.5 2809.5 942.5C2805 941.5 2788 942 2788 942"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_tpe:upc"
                x1="2843"
                y1="1057"
                x2="2843"
                y2="1016"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_upc:xpo"
                x1="2843"
                y1="1153"
                x2="2843"
                y2="1084"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_xpo:xln"
                d="M2837.02 1245.69C2837.02 1245.69 2840.98 1233 2842 1229.5C2843.02 1226 2843.02 1216 2843.02 1216L2843.02 1187.69"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_xln:sgb"
                x1="2788.82"
                y1="1299.88"
                x2="2815.82"
                y2="1272.88"
                stroke="#0055B8"
                stroke-width="6"
              />
            </g>
            <g id="line_bplrt">
              <path
                id="line_jlp:snj"
                d="M702.055 580.467C702.055 580.467 699 573.5 698 570C697 566.5 696.055 555.467 696.055 555.467"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_snj:bkp"
                d="M743.227 646.925C743.227 646.925 740.5 633.5 739.5 630C738.5 626.5 735.5 619.5 733 616C730.5 612.5 719.227 600.925 719.227 600.925"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_shv:kth"
                x1="568"
                y1="822"
                x2="568"
                y2="872"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_kth:tkw"
                x1="568"
                y1="753"
                x2="568"
                y2="800"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_tkw:pnx"
                d="M623.515 667.305L589.5 667.305C589.5 667.305 582 667.305 575 673C568 678.695 567.515 689 567.515 689L567.515 732.305"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_pnx:bkp"
                x1="713"
                y1="668"
                x2="661"
                y2="668"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_bkp:ptr"
                d="M765.781 601.91C765.781 601.91 755 611.5 752 615.5C749 619.5 746.5 626 745 630.5C743.5 635 742.5 649.5 742.5 649.5"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_ptr:pnd"
                d="M787 555.5C787 555.5 787 562.5 786 568.5C785 574.5 782.92 580.56 782.92 580.56"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_pnd:bkt"
                x1="787"
                y1="509"
                x2="787"
                y2="534"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_bkt:fjr"
                d="M761.5 453.5C761.5 453.5 769 453.5 774 454.5C779 455.5 784.5 462 786.5 468C788.5 474 787.594 485.792 787.594 485.792"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_fjr:sgr"
                d="M697 487C697 487 697 476.5 698 469.5C699 462.5 703.5 458.024 708.5 456C713.5 453.976 723 454 723 454"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_sgr:jlp"
                x1="697"
                y1="534"
                x2="697"
                y2="509"
                stroke="#718472"
                stroke-width="4"
              />
              <line
                id="line_cck:shv"
                x1="568"
                y1="894"
                x2="568"
                y2="937"
                stroke="#718472"
                stroke-width="4"
              />
            </g>
            <g id="line_nsl">
              <line
                id="line_jur:bbt"
                x1="520"
                y1="1283"
                x2="520"
                y2="1449"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_bbt:bgb"
                x1="520"
                y1="1137"
                x2="520"
                y2="1256"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_bgb:cck"
                x1="520"
                y1="971.001"
                x2="520"
                y2="1109"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_cck:ywt"
                x1="520"
                y1="790"
                x2="520"
                y2="936"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_ywt:krj"
                x1="520"
                y1="624"
                x2="520"
                y2="764"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_krj:msl"
                d="M595.725 434.255C595.725 434.255 564.5 465 555.5 479C546.5 493 534 520 528 536.5C522 553 520 597.5 520 597.5"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_msl:wdl"
                d="M781.614 379.936C781.614 379.936 741 379.936 731.5 379.936C722 379.936 686 386 673.5 390C661 394 629 410.5 629 410.5"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_wdl:adm"
                x1="893"
                y1="381"
                x2="958"
                y2="381"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_adm:sbw"
                x1="1003"
                y1="381"
                x2="1091"
                y2="381"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_sbw:cbr"
                x1="1136"
                y1="381"
                x2="1224"
                y2="381"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_cbr:yis"
                d="M1270.86 381.125C1270.86 381.125 1307.5 386.5 1319.5 390.5C1331.5 394.5 1365 411.5 1365 411.5"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_yis:ktb"
                d="M1401 437C1401 437 1419.5 457 1426.5 464.5C1433.5 472 1447 496 1447 496"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_ktb:yck"
                d="M1458.95 522.442C1458.95 522.442 1468 552.5 1469.5 559.5C1471 566.5 1472.95 596.442 1472.95 596.442"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_yck:amk"
                x1="1473"
                y1="624"
                x2="1473"
                y2="699"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_amk:bsh"
                x1="1473"
                y1="725"
                x2="1473"
                y2="811"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_bsh:bdl"
                x1="1473"
                y1="846"
                x2="1473"
                y2="883"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_bdl:tap"
                x1="1473"
                y1="910"
                x2="1473"
                y2="981"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_tap:nov"
                d="M1472.68 1008.34C1472.68 1008.34 1472.68 1034 1470 1044C1467.32 1054 1461.5 1059.5 1454.5 1067C1447.5 1074.5 1429.68 1094.34 1429.68 1094.34"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_nov:new"
                x1="1402.18"
                y1="1121.06"
                x2="1354.18"
                y2="1172.06"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_new:orc"
                d="M1320.4 1209.8L1272.5 1256C1272.5 1256 1263 1267 1254 1280.5C1245 1294 1243.4 1312.8 1243.4 1312.8"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_orc:som"
                d="M1245.37 1349.17C1245.37 1349.17 1256.5 1375 1267 1389.5C1277.5 1404 1306.37 1428.17 1306.37 1428.17"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_som:dbg"
                x1="1334.09"
                y1="1455.84"
                x2="1428.09"
                y2="1546.84"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_dbg:cth"
                d="M1466.11 1582.87C1466.11 1582.87 1645.5 1755.5 1651.5 1762.5C1657.5 1769.5 1662.11 1776.87 1662.11 1776.87"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_cth:rfp"
                x1="1667"
                y1="1814"
                x2="1667"
                y2="1876"
                stroke="#E1251B"
                stroke-width="6"
              />
              <line
                id="line_rfp:mrb"
                x1="1667"
                y1="1911"
                x2="1667"
                y2="2025"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_mrb:msp"
                d="M1666.71 2056.54C1666.71 2056.54 1669 2090.5 1682 2103.5C1695 2116.5 1707.5 2125.58 1726.5 2127.54C1745.5 2129.5 1768.71 2127.54 1768.71 2127.54"
                stroke="#E1251B"
                stroke-width="6"
              />
            </g>
            <g id="line_ewl">
              <line
                id="line_twr:tlk"
                x1="185"
                y1="844"
                x2="185"
                y2="906"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_tcr:twr"
                x1="185"
                y1="932"
                x2="185"
                y2="993"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_gcl:tcr"
                x1="185"
                y1="1020"
                x2="185"
                y2="1081"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_jkn:gcl"
                x1="185"
                y1="1108"
                x2="185"
                y2="1169"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_pnr:jkn"
                x1="185"
                y1="1196"
                x2="185"
                y2="1257"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_bnl:pnr"
                x1="185"
                y1="1284"
                x2="185"
                y2="1345"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_lks:bnl"
                d="M185 1372C185 1372 184.5 1404 187.5 1417.5C190.5 1431 202.5 1447 217.5 1457.5C232.5 1468 265 1466 265 1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_cng:lks"
                x1="376"
                y1="1466"
                x2="311"
                y2="1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_jur:cng"
                x1="464"
                y1="1466"
                x2="422"
                y2="1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_cle:jur"
                x1="645"
                y1="1466"
                x2="575"
                y2="1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_dvr:cle"
                x1="746"
                y1="1466"
                x2="690"
                y2="1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_bnv:dvr"
                x1="823"
                y1="1466"
                x2="791"
                y2="1466"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_com:bnv"
                x1="955.948"
                y1="1514.19"
                x2="923.948"
                y2="1484.19"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_que:com"
                x1="1015.92"
                y1="1572.16"
                x2="986.916"
                y2="1544.16"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_rdh:que"
                x1="1086.9"
                y1="1642.15"
                x2="1044.9"
                y2="1601.15"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_tib:rdh"
                x1="1158.93"
                y1="1711.17"
                x2="1117.19"
                y2="1671.34"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_otp:tib"
                x1="1225.9"
                y1="1777.14"
                x2="1189.3"
                y2="1741.16"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_tpg:otp"
                x1="1379.91"
                y1="1926.15"
                x2="1264.64"
                y2="1813.8"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_rfp:tpg"
                d="M1690 1911C1690 1911 1685 1931.5 1682 1936.5C1679 1941.5 1665 1957.5 1659.5 1961C1654 1964.5 1644 1968.5 1635.5 1970C1627 1971.5 1472 1970 1472 1970C1472 1970 1448.5 1971.5 1435.5 1968.5C1422.5 1965.5 1410.5 1954.5 1410.5 1954.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_cth:rfp_2"
                x1="1689"
                y1="1814"
                x2="1689"
                y2="1876"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_bgs:cth"
                x1="1823.14"
                y1="1653.1"
                x2="1701.14"
                y2="1777.1"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_lvr:bgs"
                x1="1906.12"
                y1="1570.12"
                x2="1861.12"
                y2="1615.12"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_kal:lvr"
                x1="1977.48"
                y1="1499.13"
                x2="1936.11"
                y2="1540.13"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_alj:kal"
                x1="2044.12"
                y1="1432.12"
                x2="2007.12"
                y2="1469.12"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_pyl:alj"
                x1="2124.13"
                y1="1352.11"
                x2="2074.25"
                y2="1402.59"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_eun:pyl"
                x1="2227.13"
                y1="1248.11"
                x2="2162.13"
                y2="1313.89"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_kem:eun"
                x1="2319.13"
                y1="1156.11"
                x2="2257.13"
                y2="1218.89"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_bdk:kem"
                d="M2462.53 1059.58C2462.53 1059.58 2441 1059.58 2436 1059.58C2431 1059.58 2419 1063 2411.5 1067C2404 1071 2394.5 1080.5 2394.5 1080.5L2348.55 1127.38"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_tnm:bdk"
                x1="2634"
                y1="1059"
                x2="2507"
                y2="1059"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_tnm:xpo"
                d="M2786.5 1171C2786.5 1171 2759 1172.88 2741.5 1166C2724 1159.12 2718.5 1147 2716 1134.5C2713.5 1122 2716 1077.5 2716 1077.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_xpo:cga"
                d="M2930 1171L2898 1170"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_sim:tnm"
                d="M2699.5 1016C2699.5 1016 2699.5 1021 2699.5 1023C2699.5 1025 2696.5 1030.5 2693.5 1031.5C2690.5 1032.5 2685 1034 2682 1036C2679 1038 2679 1042.5 2679 1042.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_tam:sim"
                x1="2700"
                y1="923"
                x2="2700"
                y2="989"
                stroke="#00953B"
                stroke-width="6"
              />
              <line
                id="line_psr:tam"
                x1="2700"
                y1="840"
                x2="2700"
                y2="888"
                stroke="#00953B"
                stroke-width="6"
              />
            </g>
          </g>
          <g id="labels">
            <text
              id="label_jur"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="465" y="1503.9">
                Jurong East
              </tspan>
            </text>
            <text
              id="label_cng"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="362.342" y="1501.9">
                Chinese&#10;
              </tspan>
              <tspan x="365.945" y="1527.9">
                Garden
              </tspan>
            </text>
            <text
              id="label_bbt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="544" y="1277.9">
                Bukit Batok
              </tspan>
            </text>
            <text
              id="label_bgb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="544" y="1128.9">
                Bukit Gombak
              </tspan>
            </text>
            <text
              id="label_cck"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="544" y="994.9">
                Choa Chu Kang
              </tspan>
            </text>
            <text
              id="label_ywt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="411" y="782.9">
                Yew Tee
              </tspan>
            </text>
            <text
              id="label_bkp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="809" y="695.9">
                Bukit Panjang
              </tspan>
            </text>
            <text
              id="label_kth"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="591" y="816.02">
                Keat Hong
              </tspan>
            </text>
            <text
              id="label_tkw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="591" y="748.02">
                Teck Whye
              </tspan>
            </text>
            <text
              id="label_pnx"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="612" y="652.02">
                Phoenix
              </tspan>
            </text>
            <text
              id="label_snj"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="642" y="597.02">
                Senja
              </tspan>
            </text>
            <text
              id="label_jlp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="607" y="550.02">
                Jelapang
              </tspan>
            </text>
            <text
              id="label_sgr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="632" y="503.02">
                Segar
              </tspan>
            </text>
            <text
              id="label_fjr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="724" y="436.02">
                Fajar
              </tspan>
            </text>
            <text
              id="label_stk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2048.38" y="419.02">
                Soo Teck
              </tspan>
            </text>
            <text
              id="label_cgl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2061.28" y="525.02">
                Cheng Lim
              </tspan>
            </text>
            <text
              id="label_fmw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2030.02" y="490.02">
                Farmway
              </tspan>
            </text>
            <text
              id="label_kpg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1995.38" y="456.02">
                Kupang
              </tspan>
            </text>
            <text
              id="label_tng"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1826.48" y="448.02">
                Thanggam
              </tspan>
            </text>
            <text
              id="label_fnv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1809.34" y="478.02">
                Fernvale
              </tspan>
            </text>
            <text
              id="label_lyr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1849.3" y="519.02">
                Layar
              </tspan>
            </text>
            <text
              id="label_tkg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1851.25" y="553.02">
                Tongkang
              </tspan>
            </text>
            <text
              id="label_rnj"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1897.01" y="585.02">
                Renjong
              </tspan>
            </text>
            <text
              id="label_rng"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2053.14" y="758.02">
                Ranggung
              </tspan>
            </text>
            <text
              id="label_kgk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2111.07" y="800.02">
                Kangkar
              </tspan>
            </text>
            <text
              id="label_bak"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2283.27" y="809.02">
                Bakau
              </tspan>
            </text>
            <text
              id="label_rmb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2282.34" y="743.02">
                Rumbia
              </tspan>
            </text>
            <text
              id="label_cpv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2240.38" y="704.02">
                Compassvale
              </tspan>
            </text>
            <text
              id="label_smg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2016.34" y="388.02">
                Sumang
              </tspan>
            </text>
            <text
              id="label_nbg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1992.23" y="357.02">
                Nbong
              </tspan>
            </text>
            <text
              id="label_smd"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1974.2" y="300.02">
                Samudera
              </tspan>
            </text>
            <text
              id="label_pgp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2152.62" y="294.02">
                Punggol Point
              </tspan>
            </text>
            <text
              id="label_tkl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2188.18" y="330.02">
                Teck Lee
              </tspan>
            </text>
            <text
              id="label_smk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2221.22" y="365.02">
                Sam Kee
              </tspan>
            </text>
            <text
              id="label_dam"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2376.34" y="522.02">
                Damai
              </tspan>
            </text>
            <text
              id="label_oas"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2415.37" y="556.02">
                Oasis
              </tspan>
            </text>
            <text
              id="label_kdl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2452.4" y="592.02">
                Kadaloor
              </tspan>
            </text>
            <text
              id="label_riv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2444.42" y="650.02">
                Riviera
              </tspan>
            </text>
            <text
              id="label_cre"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2259.48" y="649.02">
                Coral Edge
              </tspan>
            </text>
            <text
              id="label_mrd"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2239.37" y="616.02">
                Meridian
              </tspan>
            </text>
            <text
              id="label_cov"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2234.26" y="568.02">
                Cove
              </tspan>
            </text>
            <text
              id="label_bkt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="811" y="504.02">
                Bangkit
              </tspan>
            </text>
            <text
              id="label_pnd"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="811" y="551.02">
                Pending
              </tspan>
            </text>
            <text
              id="label_ptr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="801" y="597.02">
                Petir
              </tspan>
            </text>
            <text
              id="label_shv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="16"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="591" y="889.02">
                South View
              </tspan>
            </text>
            <text
              id="label_krj"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="436" y="616.9">
                Kranji
              </tspan>
            </text>
            <text
              id="label_csw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="772" y="773.9">
                Cashew
              </tspan>
            </text>
            <text
              id="label_hvw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="774" y="822.9">
                Hillview
              </tspan>
            </text>
            <text
              id="label_hme"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="774" y="871.9">
                Hume
              </tspan>
            </text>
            <text
              id="label_btw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="772" y="922.9">
                Beauty World
              </tspan>
            </text>
            <text
              id="label_kap"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="772" y="974.9">
                King Albert Park
              </tspan>
            </text>
            <text
              id="label_sav"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="771" y="1024.9">
                Sixth Avenue
              </tspan>
            </text>
            <text
              id="label_tkk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="787" y="1128.9">
                Tan Kah Kee
              </tspan>
            </text>
            <text
              id="label_msl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="490" y="426.9">
                Marsiling
              </tspan>
            </text>
            <text
              id="label_wdl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="684" y="357.9">
                Woodlands
              </tspan>
            </text>
            <text
              id="label_wdn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="774" y="286.9">
                Woodlands North
              </tspan>
            </text>
            <text
              id="label_wds"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="929" y="451.9">
                Woodlands South
              </tspan>
            </text>
            <text
              id="label_spl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="988" y="515.9">
                Springleaf
              </tspan>
            </text>
            <text
              id="label_ltr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1053" y="577.9">
                Lentor
              </tspan>
            </text>
            <text
              id="label_mfl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1115" y="640.9">
                Mayflower
              </tspan>
            </text>
            <text
              id="label_brh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1175" y="705.9">
                Bright Hill
              </tspan>
            </text>
            <text
              id="label_uts"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1017.04" y="818.9">
                Upper Thomson
              </tspan>
            </text>
            <text
              id="label_npr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1223.29" y="1182.9">
                Napier
              </tspan>
            </text>
            <text
              id="label_obv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="992.266" y="1260.9">
                Orchard Boulevard
              </tspan>
            </text>
            <text
              id="label_adm"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="937" y="360.9">
                Admiralty
              </tspan>
            </text>
            <text
              id="label_sbw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1056" y="359.9">
                Sembawang
              </tspan>
            </text>
            <text
              id="label_cbr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1205" y="361.9">
                Canberra
              </tspan>
            </text>
            <text
              id="label_yis"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1415" y="431.9">
                Yishun
              </tspan>
            </text>
            <text
              id="label_ktb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1487" y="517.9">
                Khatib
              </tspan>
            </text>
            <text
              id="label_yck"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1503" y="619.9">
                Yio Chu Kang
              </tspan>
            </text>
            <text
              id="label_amk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1504" y="719.9">
                Ang Mo Kio
              </tspan>
            </text>
            <text
              id="label_bsh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1486" y="801.9">
                Bishan
              </tspan>
            </text>
            <text
              id="label_lrc"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1605" y="815.9">
                Lorong Chuan
              </tspan>
            </text>
            <text
              id="label_ser"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1878" y="905.9">
                Serangoon
              </tspan>
            </text>
            <text
              id="label_bly"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1977" y="998.9">
                Bartley
              </tspan>
            </text>
            <text
              id="label_tsg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2063" y="1083.9">
                Tai Seng
              </tspan>
            </text>
            <text
              id="label_mps"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1922" y="1196.9">
                Macpherson
              </tspan>
            </text>
            <text
              id="label_ubi"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2214" y="1124.9">
                Ubi
              </tspan>
            </text>
            <text
              id="label_kkb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2289" y="1043.9">
                Kaki Bukit
              </tspan>
            </text>
            <text
              id="label_bdn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2183" y="973.9">
                Bedok North
              </tspan>
            </text>
            <text
              id="label_bdr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2426.67" y="895.9">
                Bedok&#x2028;
              </tspan>
              <tspan x="2412.13" y="921.9">
                Reservoir
              </tspan>
            </text>
            <text
              id="label_tpw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2539.07" y="897.9">
                Tampines&#10;
              </tspan>
              <tspan x="2559.59" y="923.9">
                West
              </tspan>
            </text>
            <text
              id="label_tam"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2775.07" y="913.9">
                Tampines
              </tspan>
            </text>
            <text
              id="label_tpe"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2878.18" y="1009.9">
                Tampines East
              </tspan>
            </text>
            <text
              id="label_upc"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2878.04" y="1079.9">
                Upper Changi
              </tspan>
            </text>
            <text
              id="label_xpo"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2783.23" y="1138.9">
                Expo
              </tspan>
            </text>
            <text
              id="label_cga"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2922.31" y="1211.9">
                Changi&#10;
              </tspan>
              <tspan x="2922.63" y="1237.9">
                Airport
              </tspan>
            </text>
            <text
              id="label_xln"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2859.5" y="1266.9">
                Xilin
              </tspan>
            </text>
            <text
              id="label_sgb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2770.09" y="1357.9">
                Sungei Bedok
              </tspan>
            </text>
            <text
              id="label_pyl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2213" y="1340.9">
                Paya Lebar
              </tspan>
            </text>
            <text
              id="label_dkt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2192" y="1460.9">
                Dakota
              </tspan>
            </text>
            <text
              id="label_mbt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2186" y="1558.9">
                Mountbatten
              </tspan>
            </text>
            <text
              id="label_sdm"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2167" y="1658.9">
                Stadium
              </tspan>
            </text>
            <text
              id="label_nch"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2127" y="1750.9">
                Nicoll Highway
              </tspan>
            </text>
            <text
              id="label_pmn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2082" y="1853.9">
                Promenade
              </tspan>
            </text>
            <text
              id="label_epn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1860" y="1803.9">
                Esplanade
              </tspan>
            </text>
            <text
              id="label_bbs"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1626" y="1665.9">
                Bras&#10;
              </tspan>
              <tspan x="1626" y="1691.9">
                Basah
              </tspan>
            </text>
            <text
              id="label_bft"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1950" y="1979.9">
                Bayfront
              </tspan>
            </text>
            <text
              id="label_bdl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1505" y="904.9">
                Braddell
              </tspan>
            </text>
            <text
              id="label_tap"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1504" y="998.9">
                Toa Payoh
              </tspan>
            </text>
            <text
              id="label_psr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2730" y="832.9">
                Pasir Ris
              </tspan>
            </text>
            <text
              id="label_pgc"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2314" y="431.9">
                Punggol Coast
              </tspan>
            </text>
            <text
              id="label_pgl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2289" y="488.9">
                Punggol
              </tspan>
            </text>
            <text
              id="label_skg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1929" y="635.9">
                Sengkang
              </tspan>
            </text>
            <text
              id="label_bgk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1896" y="699.9">
                Buangkok
              </tspan>
            </text>
            <text
              id="label_hgn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1840.45" y="762.9">
                Hougang
              </tspan>
            </text>
            <text
              id="label_kvn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1803.39" y="828.9">
                Kovan
              </tspan>
            </text>
            <text
              id="label_wlh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1751.07" y="1001.9">
                Woodleigh
              </tspan>
            </text>
            <text
              id="label_ptp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1666.23" y="1089.9">
                Potong Pasir
              </tspan>
            </text>
            <text
              id="label_bnk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1612.42" y="1184.9">
                Boon Keng
              </tspan>
            </text>
            <text
              id="label_frp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1611.09" y="1275.9">
                Farrer Park
              </tspan>
            </text>
            <text
              id="label_sim"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2618" y="1008.9">
                Simei
              </tspan>
            </text>
            <text
              id="label_bdk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2458.17" y="1097.9">
                Bedok
              </tspan>
            </text>
            <text
              id="label_eun"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2274.46" y="1240.9">
                Eunos
              </tspan>
            </text>
            <text
              id="label_alj"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1954.34" y="1425.9">
                Aljunied
              </tspan>
            </text>
            <text
              id="label_kal"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2026.07" y="1490.9">
                Kallang
              </tspan>
            </text>
            <text
              id="label_lvr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1953.35" y="1561.9">
                Lavender
              </tspan>
            </text>
            <text
              id="label_kem"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2367.2" y="1147.9">
                Kembangan
              </tspan>
            </text>
            <text
              id="label_tnm"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2573.06" y="1098.9">
                Tanah Merah
              </tspan>
            </text>
            <text
              id="label_nov"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1447" y="1115.9">
                Novena
              </tspan>
            </text>
            <text
              id="label_new"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1334" y="1227.9">
                Newton
              </tspan>
            </text>
            <text
              id="label_orc"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1283" y="1340.9">
                Orchard
              </tspan>
            </text>
            <text
              id="label_grw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1053.22" y="1432.9">
                Great World
              </tspan>
            </text>
            <text
              id="label_hvl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1228.02" y="1526.9">
                Havelock
              </tspan>
            </text>
            <text
              id="label_max"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1440.27" y="1855.9">
                Maxwell
              </tspan>
            </text>
            <text
              id="label_shw"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1412.12" y="2006.9">
                Shenton Way
              </tspan>
            </text>
            <text
              id="label_som"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1352" y="1449.9">
                Somerset
              </tspan>
            </text>
            <text
              id="label_cth"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1738.15" y="1789.9">
                City&#x2028;
              </tspan>
              <tspan x="1738.98" y="1815.9">
                Hall
              </tspan>
            </text>
            <text
              id="label_tpg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1288.74" y="1934.9">
                Tanjong&#10;
              </tspan>
              <tspan x="1308.82" y="1960.9">
                Pagar
              </tspan>
            </text>
            <text
              id="label_rfp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1698.27" y="1930.9">
                Raffles&#x2028;
              </tspan>
              <tspan x="1704.77" y="1956.9">
                Place
              </tspan>
            </text>
            <text
              id="label_mrb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1550.22" y="2071.9">
                Marina Bay
              </tspan>
            </text>
            <text
              id="label_grb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2156.11" y="1968.9">
                Gardens by the Bay
              </tspan>
            </text>
            <text
              id="label_trh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2315.46" y="1815.9">
                Tanjong Rhu
              </tspan>
            </text>
            <text
              id="label_ktp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2371.37" y="1753.9">
                Katong Park
              </tspan>
            </text>
            <text
              id="label_tkt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2439.41" y="1692.9">
                Tanjong Katong
              </tspan>
            </text>
            <text
              id="label_mpr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2497.47" y="1632.9">
                Marine Parade
              </tspan>
            </text>
            <text
              id="label_mtc"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2561.18" y="1570.9">
                Marine Terrace
              </tspan>
            </text>
            <text
              id="label_sgl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2618.34" y="1509.9">
                Siglap
              </tspan>
            </text>
            <text
              id="label_bsr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2672.03" y="1454.9">
                Bayshore
              </tspan>
            </text>
            <text
              id="label_bds"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="2730" y="1398.9">
                Bedok South
              </tspan>
            </text>
            <text
              id="label_msp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1828.12" y="2134.9">
                Marina South Pier
              </tspan>
            </text>
            <text
              id="label_hbf"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1179.49" y="2095.9">
                HarbourFront
              </tspan>
            </text>
            <text
              id="label_tlb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="965.221" y="1981.9">
                Telok Blangah
              </tspan>
            </text>
            <text
              id="label_lbd"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="880.377" y="1907.9">
                Labrador Park
              </tspan>
            </text>
            <text
              id="label_ppj"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="821.213" y="1826.9">
                Pasir Panjang
              </tspan>
            </text>
            <text
              id="label_hpv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="786.096" y="1750.9">
                Haw Par Villa
              </tspan>
            </text>
            <text
              id="label_krg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="768.488" y="1661.9">
                Kent Ridge
              </tspan>
            </text>
            <text
              id="label_onh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="763.355" y="1561.9">
                one-north
              </tspan>
            </text>
            <text
              id="label_bnv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="943.184" y="1472.9">
                Buona Vista
              </tspan>
            </text>
            <text
              id="label_dvr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="738.293" y="1502.9">
                Dover
              </tspan>
            </text>
            <text
              id="label_cle"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="626.279" y="1503.9">
                Clementi
              </tspan>
            </text>
            <text
              id="label_lks"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="245.473" y="1503.9">
                Lakeside
              </tspan>
            </text>
            <text
              id="label_bnl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="221.369" y="1364.9">
                Boon Lay
              </tspan>
            </text>
            <text
              id="label_pnr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="221.334" y="1276.9">
                Pioneer
              </tspan>
            </text>
            <text
              id="label_jkn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="220.266" y="1188.9">
                Joo Koon
              </tspan>
            </text>
            <text
              id="label_gcl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="222.143" y="1100.9">
                Gul Circle
              </tspan>
            </text>
            <text
              id="label_tcr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="220.277" y="1013.9">
                Tuas Crescent
              </tspan>
            </text>
            <text
              id="label_twr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="221.453" y="925.9">
                Tuas West Road
              </tspan>
            </text>
            <text
              id="label_tlk"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="221.463" y="837.9">
                Tuas Link
              </tspan>
            </text>
            <text
              id="label_hlv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="726.373" y="1331.9">
                Holland Village
              </tspan>
            </text>
            <text
              id="label_frr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="794.031" y="1228.9">
                Farrer Road
              </tspan>
            </text>
            <text
              id="label_cdt"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1046.16" y="923.9">
                Caldecott
              </tspan>
            </text>
            <text
              id="label_mrm"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1255.42" y="838.9">
                Marymount
              </tspan>
            </text>
            <text
              id="label_btn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="930" y="1042.9">
                Botanic&#x2028;
              </tspan>
              <tspan x="926.406" y="1068.9">
                Gardens
              </tspan>
            </text>
            <text
              id="label_stv"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1223.23" y="1129.9">
                Stevens
              </tspan>
            </text>
            <text
              id="label_lti"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1642.48" y="1370.9">
                Little&#x2028;
              </tspan>
              <tspan x="1643.71" y="1396.9">
                India
              </tspan>
            </text>
            <text
              id="label_rcr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1699.38" y="1464.9">
                Rochor
              </tspan>
            </text>
            <text
              id="label_bdm"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1765.24" y="1404.9">
                Bendemeer
              </tspan>
            </text>
            <text
              id="label_glb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1799.3" y="1336.9">
                Geylang Bahru
              </tspan>
            </text>
            <text
              id="label_mtr"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1947.02" y="1266.9">
                Mattar
              </tspan>
            </text>
            <text
              id="label_jlb"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1827.41" y="1506.9">
                Jalan Besar
              </tspan>
            </text>
            <text
              id="label_bgs"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1908.04" y="1642.9">
                Bugis
              </tspan>
            </text>
            <text
              id="label_dtn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1721.31" y="1984.9">
                Downtown
              </tspan>
            </text>
            <text
              id="label_tla"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1512.35" y="1901.9">
                Telok&#10;
              </tspan>
              <tspan x="1515.89" y="1927.9">
                Ayer
              </tspan>
            </text>
            <text
              id="label_ctn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1450.1" y="1724.9">
                Chinatown
              </tspan>
            </text>
            <text
              id="label_otp"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1093.31" y="1800.9">
                Outram Park
              </tspan>
            </text>
            <text
              id="label_tib"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1030.42" y="1733.9">
                Tiong Bahru
              </tspan>
            </text>
            <text
              id="label_rdh"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1009.1" y="1664.9">
                Redhill
              </tspan>
            </text>
            <text
              id="label_que"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1057.44" y="1594.9">
                Queenstown
              </tspan>
            </text>
            <text
              id="label_com"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1000.24" y="1536.9">
                Commonwealth
              </tspan>
            </text>
            <text
              id="label_fcn"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1236.25" y="1613.9">
                Fort Canning
              </tspan>
            </text>
            <text
              id="label_bcl"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1622.48" y="1560.9">
                Bencoolen
              </tspan>
            </text>
            <text
              id="label_dbg"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1461.44" y="1516.9">
                Dhoby&#x2028;
              </tspan>
              <tspan x="1462.99" y="1542.9">
                Ghaut
              </tspan>
            </text>
            <text
              id="label_crq"
              fill="#2D2A26"
              font-family="Radio Canada Big"
              font-size="20"
              font-weight="600"
              letter-spacing="0em"
            >
              <tspan x="1464" y="1663.9">
                Clarke&#10;
              </tspan>
              <tspan x="1464" y="1689.9">
                Quay
              </tspan>
            </text>
          </g>
          <g id="nodes">
            <g id="node_bsh">
              <g clip-path="url(#clip0_13_2)">
                <g id="nsl">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1419 813)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 17"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1426.33" y="833.52">
                      NS 17
                    </tspan>
                  </text>
                </g>
                <g id="ccl">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1471.5 813)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 15"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1478.14" y="833.52">
                      CC 15
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_pgl">
              <g clip-path="url(#clip1_13_2)">
                <g id="nel">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2172 467)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 17"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2179.29" y="487.52">
                      NE 17
                    </tspan>
                  </text>
                </g>
                <g id="pglrt">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2224.5 467)"
                    fill="#718472"
                  />
                  <text
                    id="PTC"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2236.32" y="487.52">
                      PTC
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_skg">
              <g clip-path="url(#clip2_13_2)">
                <g id="nel_2">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2033 614)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 16"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2039.8" y="634.52">
                      NE 16
                    </tspan>
                  </text>
                </g>
                <g id="sklrt">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2085.5 614)"
                    fill="#718472"
                  />
                  <text
                    id="STC"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2097.44" y="634.52">
                      STC
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_ser">
              <g clip-path="url(#clip3_13_2)">
                <g id="nel_3">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1764 884)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 12"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1770.96" y="904.52">
                      NE 12
                    </tspan>
                  </text>
                </g>
                <g id="ccl_2">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1816.5 884)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 13"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1823.23" y="904.52">
                      CC 13
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_mps">
              <g clip-path="url(#clip4_13_2)">
                <g id="dtl">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2047 1175)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 26"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2052.7" y="1195.52">
                      DT 26
                    </tspan>
                  </text>
                </g>
                <g id="ccl_3">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2099.5 1175)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 10"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2105.9" y="1195.52">
                      CC 10
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_pyl">
              <g clip-path="url(#clip5_13_2)">
                <g id="ewl">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2094 1318)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 8"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2101.89" y="1338.52">
                      EW 8
                    </tspan>
                  </text>
                </g>
                <g id="ccl_4">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2146.5 1318)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 9"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2156.02" y="1338.52">
                      CC 9
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_tnm">
              <g clip-path="url(#clip6_13_2)">
                <g id="ewl_2">
                  <rect
                    width="52"
                    height="30"
                    transform="translate(2637 1045)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 4"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2644.26" y="1065.52">
                      EW 4
                    </tspan>
                  </text>
                </g>
                <g id="ewl_3">
                  <rect
                    width="52"
                    height="30"
                    transform="translate(2691 1045)"
                    fill="#00953B"
                  />
                  <text
                    id="CG"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2705.84" y="1065.52">
                      CG
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_pmn">
              <g clip-path="url(#clip7_13_2)">
                <g id="dtl_2">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1968 1833)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 15"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1975.45" y="1853.52">
                      DT 15
                    </tspan>
                  </text>
                </g>
                <g id="ccl_5">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2020.5 1833)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 4"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2030.27" y="1853.52">
                      CC 4
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bft">
              <g clip-path="url(#clip8_13_2)">
                <g id="dtl_3">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1838 1956)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 16"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1845.38" y="1976.52">
                      DT 16
                    </tspan>
                  </text>
                </g>
                <g id="ccl_6">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1890.5 1956)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CE 1"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1902.38" y="1976.52">
                      CE 1
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_orc">
              <g clip-path="url(#clip9_13_2)">
                <g id="tel">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1169 1317)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 14"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1177.05" y="1337.52">
                      TE 14
                    </tspan>
                  </text>
                </g>
                <g id="nsl_2">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1221.5 1317)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 22"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1226.81" y="1337.52">
                      NS 22
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_cth">
              <g clip-path="url(#clip10_13_2)">
                <g id="nsl_3">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1629 1782)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 25"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1634.22" y="1802.52">
                      NS 25
                    </tspan>
                  </text>
                </g>
                <g id="ewl_4">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1681.5 1782)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 13"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1686.46" y="1802.52">
                      EW 13
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_rfp">
              <g clip-path="url(#clip11_13_2)">
                <g id="nsl_4">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1627 1879)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 26"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1632.16" y="1899.52">
                      NS 26
                    </tspan>
                  </text>
                </g>
                <g id="ewl_5">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1679.5 1879)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 14"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1684.56" y="1899.52">
                      EW 14
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_hbf">
              <g clip-path="url(#clip12_13_2)">
                <g id="ccl">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1189 2041)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 29"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1193.89" y="2061.52">
                      CC 29
                    </tspan>
                  </text>
                </g>
                <g id="nel">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1241.5 2041)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 1"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1253.09" y="2061.52">
                      NE 1
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_dbg">
              <g clip-path="url(#clip13_13_2)">
                <g id="nsl_5">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1412 1550)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 24"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1417.81" y="1570.52">
                      NS 24
                    </tspan>
                  </text>
                </g>
                <g id="nel_4">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1465 1550)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 6"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1475" y="1570.52">
                      NE 6
                    </tspan>
                  </text>
                </g>
                <g id="ccl_7">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1518 1550)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 1"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1529.62" y="1570.52">
                      CC 1
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_otp">
              <g clip-path="url(#clip14_13_2)">
                <g id="ewl_6">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1220 1780)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 16"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1225.06" y="1800.52">
                      EW 16
                    </tspan>
                  </text>
                </g>
                <g id="nel_5">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1273 1780)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 3"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1283.15" y="1800.52">
                      NE 3
                    </tspan>
                  </text>
                </g>
                <g id="tel_2">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1326 1780)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 17"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1334.54" y="1800.52">
                      TE 17
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_mrb">
              <g clip-path="url(#clip15_13_2)">
                <g id="nsl_6">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1656 2027)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 27"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1661.97" y="2047.52">
                      NS 27
                    </tspan>
                  </text>
                </g>
                <g id="tel_3">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1709 2027)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 20"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1715.19" y="2047.52">
                      TE 20
                    </tspan>
                  </text>
                </g>
                <g id="ccl_8">
                  <rect
                    width="54"
                    height="30"
                    transform="translate(1762 2027)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CE 2"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1772.44" y="2047.52">
                      CE 2
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_new">
              <g clip-path="url(#clip16_13_2)">
                <g id="nsl_7">
                  <rect
                    x="1314"
                    y="1176"
                    width="51.5"
                    height="30"
                    rx="10"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 21"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1320" y="1196.52">
                      NS 21
                    </tspan>
                  </text>
                </g>
                <rect
                  id="Rectangle 1"
                  x="1364.5"
                  y="1188"
                  width="6"
                  height="6"
                  fill="#E1251B"
                />
                <rect
                  id="Rectangle 2"
                  x="1369.5"
                  y="1188"
                  width="6"
                  height="6"
                  fill="#0055B8"
                />
                <g id="dtl_4">
                  <rect
                    x="1374.5"
                    y="1176"
                    width="51.5"
                    height="30"
                    rx="10"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 11"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1382.73" y="1196.52">
                      DT 11
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_jur">
              <g clip-path="url(#clip17_13_2)">
                <g id="nsl_8">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(467 1451)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 1"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="478.633" y="1471.52">
                      NS 1
                    </tspan>
                  </text>
                </g>
                <g id="ewl_7">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(519.5 1451)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 24"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="523.031" y="1471.52">
                      EW 24
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bnv">
              <g clip-path="url(#clip18_13_2)">
                <g id="ccl_9">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(827 1449)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 22"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="832.047" y="1469.52">
                      CC 22
                    </tspan>
                  </text>
                </g>
                <g id="ewl_8">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(879.5 1449)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 21"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="884.469" y="1469.52">
                      EW 21
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_btn">
              <g clip-path="url(#clip19_13_2)">
                <g id="ccl_10">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(947 1077)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 19"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="953.578" y="1097.52">
                      CC 19
                    </tspan>
                  </text>
                </g>
                <g id="dtl_5">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(999.5 1077)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 9"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1009.83" y="1097.52">
                      DT 9
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_lti">
              <g clip-path="url(#clip20_13_2)">
                <g id="nel_6">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1525 1351)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 7"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1535.23" y="1371.52">
                      NE 7
                    </tspan>
                  </text>
                </g>
                <g id="dtl_6">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1577.5 1351)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 12"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1585.04" y="1371.52">
                      DT 12
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bgs">
              <g clip-path="url(#clip21_13_2)">
                <g id="ewl_9">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1791 1619)"
                    fill="#00953B"
                  />
                  <text
                    id="EW 12"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1795.97" y="1639.52">
                      EW 12
                    </tspan>
                  </text>
                </g>
                <g id="dtl_7">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1843.5 1619)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 14"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1851.13" y="1639.52">
                      DT 14
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_xpo">
              <g clip-path="url(#clip22_13_2)">
                <g id="ewl_10">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2790 1156)"
                    fill="#00953B"
                  />
                  <text
                    id="CG 1"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2801.08" y="1176.52">
                      CG 1
                    </tspan>
                  </text>
                </g>
                <g id="dtl_8">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2842.5 1156)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 35"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2848.25" y="1176.52">
                      DT 35
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_sgb">
              <g clip-path="url(#clip23_13_2)">
                <g id="tel_4">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2716 1304)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 31"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2723.95" y="1324.52">
                      TE 31
                    </tspan>
                  </text>
                </g>
                <g id="dtl_9">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(2768.5 1304)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 37"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="2774.67" y="1324.52">
                      DT 37
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_ctn">
              <g clip-path="url(#clip24_13_2)">
                <g id="nel_7">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1337 1701)"
                    fill="#9E28B5"
                  />
                  <text
                    id="NE 4"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1347" y="1721.52">
                      NE 4
                    </tspan>
                  </text>
                </g>
                <g id="dtl_10">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1389.5 1701)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 19"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1396.88" y="1721.52">
                      DT 19
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_stv">
              <g clip-path="url(#clip25_13_2)">
                <g id="dtl_11">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1144 1077)"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 10"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1151.2" y="1097.52">
                      DT 10
                    </tspan>
                  </text>
                </g>
                <g id="tel_5">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1196.5 1077)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 11"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1206.15" y="1097.52">
                      TE 11
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_cdt">
              <g clip-path="url(#clip26_13_2)">
                <g id="ccl_11">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1144 903)"
                    fill="#FF9E18"
                  />
                  <text
                    id="CC 17"
                    fill="#383A37"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1151.06" y="923.52">
                      CC 17
                    </tspan>
                  </text>
                </g>
                <g id="tel_6">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(1196.5 903)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 9"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="1207.25" y="923.52">
                      TE 9
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bbt">
              <rect
                x="497"
                y="1258"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="503.296" y="1274.83">
                  NS 2
                </tspan>
              </text>
            </g>
            <g id="node_bgb">
              <rect
                x="498"
                y="1111"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="504.289" y="1127.83">
                  NS 3
                </tspan>
              </text>
            </g>
            <g id="node_ywt">
              <rect
                x="501"
                y="765"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="507.214" y="781.83">
                  NS 5
                </tspan>
              </text>
            </g>
            <g id="node_csw">
              <rect
                x="721"
                y="755"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.768" y="771.83">
                  DT 2
                </tspan>
              </text>
            </g>
            <g id="node_hvw">
              <rect
                x="721"
                y="804"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.761" y="820.83">
                  DT 3
                </tspan>
              </text>
            </g>
            <g id="node_hme">
              <rect
                x="721"
                y="855"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.85" y="871.83">
                  DT 4
                </tspan>
              </text>
            </g>
            <g id="node_btw">
              <rect
                x="721"
                y="905"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.686" y="921.83">
                  DT 5
                </tspan>
              </text>
            </g>
            <g id="node_kap">
              <rect
                x="721"
                y="955"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.631" y="971.83">
                  DT 6
                </tspan>
              </text>
            </g>
            <g id="node_sav">
              <rect
                x="721"
                y="1006"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="728.055" y="1022.83">
                  DT 7
                </tspan>
              </text>
            </g>
            <g id="node_tkk">
              <rect
                x="822"
                y="1082"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="828.747" y="1098.83">
                  DT 8
                </tspan>
              </text>
            </g>
            <g id="node_rcr">
              <rect
                x="1650"
                y="1445"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 13"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1654.18" y="1461.83">
                  DT 13
                </tspan>
              </text>
            </g>
            <g id="node_dtn">
              <rect
                x="1748"
                y="1990"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 17"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1752.48" y="2006.83">
                  DT 17
                </tspan>
              </text>
            </g>
            <g id="node_tla">
              <rect
                x="1566"
                y="1885"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 18"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1570.17" y="1901.83">
                  DT 18
                </tspan>
              </text>
            </g>
            <g id="node_fcn">
              <rect
                x="1363"
                y="1596"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 20"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1365.42" y="1612.83">
                  DT 20
                </tspan>
              </text>
            </g>
            <g id="node_bcl">
              <rect
                x="1701"
                y="1566"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 21"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1705.19" y="1582.83">
                  DT 21
                </tspan>
              </text>
            </g>
            <g id="node_jlb">
              <rect
                x="1777"
                y="1489"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 22"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1779.71" y="1505.83">
                  DT 22
                </tspan>
              </text>
            </g>
            <g id="node_bdm">
              <rect
                x="1877"
                y="1389"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 23"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1879.71" y="1405.83">
                  DT 23
                </tspan>
              </text>
            </g>
            <g id="node_glb">
              <rect
                x="1941"
                y="1319"
                width="42"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 24"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1943.93" y="1335.83">
                  DT 24
                </tspan>
              </text>
            </g>
            <g id="node_mtr">
              <rect
                x="2013"
                y="1248"
                width="43"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 25"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2016.13" y="1264.83">
                  DT 25
                </tspan>
              </text>
            </g>
            <g id="node_ubi">
              <rect
                x="2162"
                y="1101"
                width="43"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 27"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2165.57" y="1117.83">
                  DT 27
                </tspan>
              </text>
            </g>
            <g id="node_kkb">
              <rect
                x="2237"
                y="1024"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 28"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2240.69" y="1040.83">
                  DT 28
                </tspan>
              </text>
            </g>
            <g id="node_bdn">
              <rect
                x="2309"
                y="954"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 29"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2312.58" y="970.83">
                  DT 29
                </tspan>
              </text>
            </g>
            <g id="node_bgk">
              <rect
                x="1997"
                y="682"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 15"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2001.6" y="698.83">
                  NE 15
                </tspan>
              </text>
            </g>
            <g id="node_hgn">
              <rect
                x="1935"
                y="746"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 14"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1939.77" y="762.83">
                  NE 14
                </tspan>
              </text>
            </g>
            <g id="node_kvn">
              <rect
                x="1869"
                y="811"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 13"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1873.68" y="827.83">
                  NE 13
                </tspan>
              </text>
            </g>
            <g id="node_wlh">
              <rect
                x="1695"
                y="980"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 11"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1701.16" y="996.83">
                  NE 11
                </tspan>
              </text>
            </g>
            <g id="node_ptp">
              <rect
                x="1610"
                y="1070"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 10"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1614.39" y="1086.83">
                  NE 10
                </tspan>
              </text>
            </g>
            <g id="node_bnk">
              <rect
                x="1553"
                y="1165"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 9"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1560.12" y="1181.83">
                  NE 9
                </tspan>
              </text>
            </g>
            <g id="node_frp">
              <rect
                x="1553"
                y="1257"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1560.24" y="1273.83">
                  NE 8
                </tspan>
              </text>
            </g>
            <g id="node_crq">
              <rect
                x="1416"
                y="1645"
                width="44"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1423.18" y="1661.83">
                  NE 5
                </tspan>
              </text>
            </g>
            <g id="node_bdr">
              <rect
                x="2437"
                y="930"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 30"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2440.41" y="946.83">
                  DT 30
                </tspan>
              </text>
            </g>
            <g id="node_tpw">
              <rect
                x="2565"
                y="930"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 31"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2570.18" y="946.83">
                  DT 31
                </tspan>
              </text>
            </g>
            <g id="node_tpe">
              <rect
                x="2822"
                y="991"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 33"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2825.7" y="1007.83">
                  DT 33
                </tspan>
              </text>
            </g>
            <g id="node_upc">
              <rect
                x="2821"
                y="1059"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 34"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2824.79" y="1075.83">
                  DT 34
                </tspan>
              </text>
            </g>
            <g id="node_xln">
              <rect
                x="2805"
                y="1248"
                width="44"
                height="24"
                rx="10"
                fill="#0055B8"
              />
              <text
                id="DT 36"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2808.57" y="1264.83">
                  DT 36
                </tspan>
              </text>
            </g>
            <g id="node_shv">
              <rect
                x="552"
                y="873"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="556.801" y="887.14">
                  BP 2
                </tspan>
              </text>
            </g>
            <g id="node_kth">
              <rect
                x="552"
                y="801"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="556.795" y="815.14">
                  BP 3
                </tspan>
              </text>
            </g>
            <g id="node_tkw">
              <rect
                x="551"
                y="732"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="555.871" y="746.14">
                  BP 4
                </tspan>
              </text>
            </g>
            <g id="node_pnx">
              <rect
                x="625"
                y="657"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="629.73" y="671.14">
                  BP 5
                </tspan>
              </text>
            </g>
            <g id="node_snj">
              <rect
                x="688"
                y="582"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 13"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="690.586" y="596.14">
                  BP 13
                </tspan>
              </text>
            </g>
            <g id="node_sgr">
              <rect
                x="680"
                y="488"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 11"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="683.857" y="502.14">
                  BP 11
                </tspan>
              </text>
            </g>
            <g id="node_fjr">
              <rect
                x="725"
                y="443"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 10"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="727.34" y="457.14">
                  BP 10
                </tspan>
              </text>
            </g>
            <g id="node_stk">
              <rect
                x="2117"
                y="403"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2120.12" y="417.14">
                  PW 7
                </tspan>
              </text>
            </g>
            <g id="node_cgl">
              <rect
                x="2023"
                y="509"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2027.17" y="523.14">
                  SW 1
                </tspan>
              </text>
            </g>
            <g id="node_fmw">
              <rect
                x="1992"
                y="473"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1994.9" y="487.14">
                  SW 2
                </tspan>
              </text>
            </g>
            <g id="node_kpg">
              <rect
                x="1957"
                y="440"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1959.9" y="454.14">
                  SW 3
                </tspan>
              </text>
            </g>
            <g id="node_tng">
              <rect
                x="1909"
                y="432"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1911.97" y="446.14">
                  SW 4
                </tspan>
              </text>
            </g>
            <g id="node_fnv">
              <rect
                x="1877"
                y="462"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1879.83" y="476.14">
                  SW 5
                </tspan>
              </text>
            </g>
            <g id="node_lyr">
              <rect
                x="1893"
                y="503"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1895.79" y="517.14">
                  SW 6
                </tspan>
              </text>
            </g>
            <g id="node_tkg">
              <rect
                x="1929"
                y="537"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1932.15" y="551.14">
                  SW 7
                </tspan>
              </text>
            </g>
            <g id="node_rnj">
              <rect
                x="1961"
                y="569"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SW 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1963.88" y="583.14">
                  SW 8
                </tspan>
              </text>
            </g>
            <g id="node_rng">
              <rect
                x="2133"
                y="742"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SE 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2137.92" y="756.14">
                  SE 5
                </tspan>
              </text>
            </g>
            <g id="node_rmb">
              <rect
                x="2243"
                y="726"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SE 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2247.99" y="740.14">
                  SE 2
                </tspan>
              </text>
            </g>
            <g id="node_cpv">
              <rect
                x="2204"
                y="688"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SE 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2210.25" y="702.14">
                  SE 1
                </tspan>
              </text>
            </g>
            <g id="node_kgk">
              <rect
                x="2177"
                y="784"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SE 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2182.06" y="798.14">
                  SE 4
                </tspan>
              </text>
            </g>
            <g id="node_bak">
              <rect
                x="2245"
                y="794"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="SE 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2249.98" y="808.14">
                  SE 3
                </tspan>
              </text>
            </g>
            <g id="node_smg">
              <rect
                x="2079"
                y="372"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2081.76" y="386.14">
                  PW 6
                </tspan>
              </text>
            </g>
            <g id="node_nbg">
              <rect
                x="2048"
                y="341"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2050.8" y="355.14">
                  PW 5
                </tspan>
              </text>
            </g>
            <g id="node_smd">
              <rect
                x="2052"
                y="284"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2054.94" y="298.14">
                  PW 4
                </tspan>
              </text>
            </g>
            <g id="node_pgp">
              <rect
                x="2114"
                y="279"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2116.87" y="293.14">
                  PW 3
                </tspan>
              </text>
            </g>
            <g id="node_tkl">
              <rect
                x="2148"
                y="314"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2150.87" y="328.14">
                  PW 2
                </tspan>
              </text>
            </g>
            <g id="node_smk">
              <rect
                x="2184"
                y="350"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PW 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2188.14" y="364.14">
                  PW 1
                </tspan>
              </text>
            </g>
            <g id="node_dam">
              <rect
                x="2337"
                y="506"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2342.15" y="520.14">
                  PE 7
                </tspan>
              </text>
            </g>
            <g id="node_oas">
              <rect
                x="2378"
                y="541"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2382.78" y="555.14">
                  PE 6
                </tspan>
              </text>
            </g>
            <g id="node_kdl">
              <rect
                x="2414"
                y="577"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2418.83" y="591.14">
                  PE 5
                </tspan>
              </text>
            </g>
            <g id="node_riv">
              <rect
                x="2405"
                y="635"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2409.97" y="649.14">
                  PE 4
                </tspan>
              </text>
            </g>
            <g id="node_cre">
              <rect
                x="2342"
                y="633"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2346.89" y="647.14">
                  PE 3
                </tspan>
              </text>
            </g>
            <g id="node_mrd">
              <rect
                x="2309"
                y="600"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2313.9" y="614.14">
                  PE 2
                </tspan>
              </text>
            </g>
            <g id="node_cov">
              <rect
                x="2274"
                y="552"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="PE 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2280.17" y="566.14">
                  PE 1
                </tspan>
              </text>
            </g>
            <g id="node_bkt">
              <rect
                x="769"
                y="488"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 9"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="773.684" y="502.14">
                  BP 9
                </tspan>
              </text>
            </g>
            <g id="node_pnd">
              <rect
                x="770"
                y="535"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="774.783" y="549.14">
                  BP 8
                </tspan>
              </text>
            </g>
            <g id="node_ptr">
              <rect
                x="759"
                y="582"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="764.047" y="596.14">
                  BP 7
                </tspan>
              </text>
            </g>
            <g id="node_jlp">
              <rect
                x="681"
                y="535"
                width="34"
                height="20"
                rx="6"
                fill="#718472"
              />
              <text
                id="BP 12"
                fill="white"
                font-family="Radio Canada Big"
                font-size="12"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="683.592" y="549.14">
                  BP 12
                </tspan>
              </text>
            </g>
            <g id="node_cck">
              <g clip-path="url(#clip27_13_2)">
                <g id="nsl_9">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(485 939)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 4"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="495.039" y="959.52">
                      NS 4
                    </tspan>
                  </text>
                </g>
                <g id="bplrt">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(537.5 939)"
                    fill="#718472"
                  />
                  <text
                    id="BP 1"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="549.672" y="959.52">
                      BP 1
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bkp">
              <g clip-path="url(#clip28_13_2)">
                <g id="bplrt_2">
                  <rect
                    x="715"
                    y="650"
                    width="56"
                    height="32.5"
                    rx="10"
                    fill="#718472"
                  />
                  <text
                    id="BP 6"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="726.578" y="671.77">
                      BP 6
                    </tspan>
                  </text>
                </g>
                <rect
                  id="Rectangle 3"
                  x="740.5"
                  y="681.5"
                  width="5"
                  height="8"
                  fill="#718472"
                />
                <rect
                  id="Rectangle 4"
                  x="740.5"
                  y="688.5"
                  width="5"
                  height="8"
                  fill="#0055B8"
                />
                <g id="dtl_12">
                  <rect
                    x="715"
                    y="695.5"
                    width="56"
                    height="32.5"
                    rx="10"
                    fill="#0055B8"
                  />
                  <text
                    id="DT 1"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="728.422" y="717.27">
                      DT 1
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_tam">
              <g id="ewl_11">
                <rect
                  x="2674"
                  y="889"
                  width="56"
                  height="32.5"
                  rx="10"
                  fill="#00953B"
                />
                <text
                  id="EW 2"
                  fill="white"
                  font-family="Radio Canada Big"
                  font-size="16"
                  font-weight="600"
                  letter-spacing="0em"
                >
                  <tspan x="2683.16" y="910.77">
                    EW 2
                  </tspan>
                </text>
              </g>
              <g id="Group 1">
                <rect
                  id="Rectangle 3_2"
                  x="2719.38"
                  y="920.114"
                  width="5"
                  height="11.3495"
                  transform="rotate(-45 2719.38 920.114)"
                  fill="#00953B"
                />
                <rect
                  id="Rectangle 4_2"
                  x="2726.4"
                  y="927.136"
                  width="5"
                  height="11.3495"
                  transform="rotate(-45 2726.4 927.136)"
                  fill="#0055B8"
                />
              </g>
              <g id="dtl_13">
                <rect
                  x="2730"
                  y="926.5"
                  width="56"
                  height="32.5"
                  rx="10"
                  fill="#0055B8"
                />
                <text
                  id="DT 32"
                  fill="white"
                  font-family="Radio Canada Big"
                  font-size="16"
                  font-weight="600"
                  letter-spacing="0em"
                >
                  <tspan x="2737.09" y="948.27">
                    DT 32
                  </tspan>
                </text>
              </g>
            </g>
            <g id="node_wdl">
              <g clip-path="url(#clip29_13_2)">
                <g id="nsl_10">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(786 365)"
                    fill="#E1251B"
                  />
                  <text
                    id="NS 9"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="795.789" y="385.52">
                      NS 9
                    </tspan>
                  </text>
                </g>
                <g id="tel_7">
                  <rect
                    width="53.5"
                    height="30"
                    transform="translate(838.5 365)"
                    fill="#9D5918"
                  />
                  <text
                    id="TE 2"
                    fill="white"
                    font-family="Radio Canada Big"
                    font-size="16"
                    font-weight="600"
                    letter-spacing="0em"
                  >
                    <tspan x="849.406" y="385.52">
                      TE 2
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_krj">
              <rect
                x="501"
                y="599"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="507.583" y="615.83">
                  NS 7
                </tspan>
              </text>
            </g>
            <g id="node_msl">
              <rect
                x="589"
                y="409"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="595.275" y="425.83">
                  NS 8
                </tspan>
              </text>
            </g>
            <g id="node_wdn">
              <rect
                x="723"
                y="269"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="731.613" y="285.83">
                  TE 1
                </tspan>
              </text>
            </g>
            <g id="node_wds">
              <rect
                x="877"
                y="433"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="884.13" y="449.83">
                  TE 3
                </tspan>
              </text>
            </g>
            <g id="node_spl">
              <rect
                x="938"
                y="496"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 4"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="945.219" y="512.83">
                  TE 4
                </tspan>
              </text>
            </g>
            <g id="node_ltr">
              <rect
                x="998"
                y="560"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1005.05" y="576.83">
                  TE 5
                </tspan>
              </text>
            </g>
            <g id="node_mfl">
              <rect
                x="1059"
                y="623"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1066" y="639.83">
                  TE 6
                </tspan>
              </text>
            </g>
            <g id="node_brh">
              <rect
                x="1120"
                y="687"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1127.42" y="703.83">
                  TE 7
                </tspan>
              </text>
            </g>
            <g id="node_uts">
              <rect
                x="1176"
                y="801"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 8"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1183.12" y="817.83">
                  TE 8
                </tspan>
              </text>
            </g>
            <g id="node_npr">
              <rect
                x="1175"
                y="1164"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 12"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1179.56" y="1180.83">
                  TE 12
                </tspan>
              </text>
            </g>
            <g id="node_obv">
              <rect
                x="1175"
                y="1242"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 13"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1179.55" y="1258.83">
                  TE 13
                </tspan>
              </text>
            </g>
            <g id="node_grw">
              <rect
                x="1175"
                y="1414"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 15"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1179.48" y="1430.83">
                  TE 15
                </tspan>
              </text>
            </g>
            <g id="node_hvl">
              <rect
                x="1177"
                y="1507"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 16"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1181.42" y="1523.83">
                  TE 16
                </tspan>
              </text>
            </g>
            <g id="node_max">
              <rect
                x="1392"
                y="1838"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 18"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1396.54" y="1854.83">
                  TE 18
                </tspan>
              </text>
            </g>
            <g id="node_shw">
              <rect
                x="1544"
                y="1987"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 19"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1548.42" y="2003.83">
                  TE 19
                </tspan>
              </text>
            </g>
            <g id="node_grb">
              <rect
                x="2102"
                y="1949"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 22"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2105.08" y="1965.83">
                  TE 22
                </tspan>
              </text>
            </g>
            <g id="node_trh">
              <rect
                x="2258"
                y="1796"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 23"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2261.08" y="1812.83">
                  TE 23
                </tspan>
              </text>
            </g>
            <g id="node_ktp">
              <rect
                x="2319"
                y="1735"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 24"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2322.3" y="1751.83">
                  TE 24
                </tspan>
              </text>
            </g>
            <g id="node_tkt">
              <rect
                x="2380"
                y="1674"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 25"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2383" y="1690.83">
                  TE 25
                </tspan>
              </text>
            </g>
            <g id="node_mpr">
              <rect
                x="2441"
                y="1613"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 26"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2443.95" y="1629.83">
                  TE 26
                </tspan>
              </text>
            </g>
            <g id="node_mtc">
              <rect
                x="2502"
                y="1552"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 27"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2505.44" y="1568.83">
                  TE 27
                </tspan>
              </text>
            </g>
            <g id="node_sgl">
              <rect
                x="2563"
                y="1491"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 28"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2566.06" y="1507.83">
                  TE 28
                </tspan>
              </text>
            </g>
            <g id="node_bsr">
              <rect
                x="2617"
                y="1437"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 29"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2619.95" y="1453.83">
                  TE 29
                </tspan>
              </text>
            </g>
            <g id="node_bds">
              <rect
                x="2674"
                y="1380"
                width="42"
                height="24"
                rx="10"
                fill="#9D5918"
              />
              <text
                id="TE 30"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2676.78" y="1396.83">
                  TE 30
                </tspan>
              </text>
            </g>
            <g id="node_adm">
              <rect
                x="959"
                y="369"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 10"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="962.425" y="385.83">
                  NS 10
                </tspan>
              </text>
            </g>
            <g id="node_sbw">
              <rect
                x="1092"
                y="369"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 11"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1097.2" y="385.83">
                  NS 11
                </tspan>
              </text>
            </g>
            <g id="node_cbr">
              <rect
                x="1227"
                y="369"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 12"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1230.72" y="385.83">
                  NS 12
                </tspan>
              </text>
            </g>
            <g id="node_yis">
              <rect
                x="1362"
                y="412"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 13"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1365.71" y="428.83">
                  NS 13
                </tspan>
              </text>
            </g>
            <g id="node_ktb">
              <rect
                x="1433"
                y="498"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 14"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1436.8" y="514.83">
                  NS 14
                </tspan>
              </text>
            </g>
            <g id="node_pgc">
              <rect
                x="2260"
                y="413"
                width="42"
                height="24"
                rx="10"
                fill="#9E28B5"
              />
              <text
                id="NE 18"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2263.66" y="429.83">
                  NE 18
                </tspan>
              </text>
            </g>
            <g id="node_yck">
              <rect
                x="1449"
                y="599"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 15"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1452.64" y="615.83">
                  NS 15
                </tspan>
              </text>
            </g>
            <g id="node_amk">
              <rect
                x="1452"
                y="700"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 16"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1455.58" y="716.83">
                  NS 16
                </tspan>
              </text>
            </g>
            <g id="node_bdl">
              <rect
                x="1451"
                y="885"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 18"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1454.7" y="901.83">
                  NS 18
                </tspan>
              </text>
            </g>
            <g id="node_tap">
              <rect
                x="1451"
                y="982"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 19"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1454.58" y="998.83">
                  NS 19
                </tspan>
              </text>
            </g>
            <g id="node_nov">
              <rect
                x="1393"
                y="1095"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 20"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1394.95" y="1111.83">
                  NS 20
                </tspan>
              </text>
            </g>
            <g id="node_som">
              <rect
                x="1302"
                y="1430"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 23"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1304.24" y="1446.83">
                  NS 23
                </tspan>
              </text>
            </g>
            <g id="node_msp">
              <rect
                x="1771"
                y="2115"
                width="42"
                height="24"
                rx="10"
                fill="#E1251B"
              />
              <text
                id="NS 28"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1773.22" y="2131.83">
                  NS 28
                </tspan>
              </text>
            </g>
            <g id="node_tlb">
              <rect
                x="1104"
                y="1962"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 28"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1105.99" y="1978.83">
                  CC 28
                </tspan>
              </text>
            </g>
            <g id="node_lbd">
              <rect
                x="1022"
                y="1889"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 27"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1024.37" y="1905.83">
                  CC 27
                </tspan>
              </text>
            </g>
            <g id="node_ppj">
              <rect
                x="962"
                y="1811"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 26"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="963.873" y="1827.83">
                  CC 26
                </tspan>
              </text>
            </g>
            <g id="node_hpv">
              <rect
                x="916"
                y="1732"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 25"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="917.928" y="1748.83">
                  CC 25
                </tspan>
              </text>
            </g>
            <g id="node_krg">
              <rect
                x="886"
                y="1642"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 24"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="888.229" y="1658.83">
                  CC 24
                </tspan>
              </text>
            </g>
            <g id="node_onh">
              <rect
                x="865"
                y="1543"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 23"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="867.003" y="1559.83">
                  CC 23
                </tspan>
              </text>
            </g>
            <g id="node_hlv">
              <rect
                x="872"
                y="1314"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 21"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="875.486" y="1330.83">
                  CC 21
                </tspan>
              </text>
            </g>
            <g id="node_frr">
              <rect
                x="909"
                y="1208"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 20"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="910.716" y="1224.83">
                  CC 20
                </tspan>
              </text>
            </g>
            <g id="node_mrm">
              <rect
                x="1289"
                y="849"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 16"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1292.35" y="865.83">
                  CC 16
                </tspan>
              </text>
            </g>
            <g id="node_lrc">
              <rect
                x="1641"
                y="830"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 14"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1644.57" y="846.83">
                  CC 14
                </tspan>
              </text>
            </g>
            <g id="node_bly">
              <rect
                x="1925"
                y="977"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 12"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1928.49" y="993.83">
                  CC 12
                </tspan>
              </text>
            </g>
            <g id="node_tsg">
              <rect
                x="2012"
                y="1066"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 11"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2016.96" y="1082.83">
                  CC 11
                </tspan>
              </text>
            </g>
            <g id="node_dkt">
              <rect
                x="2140"
                y="1441"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 8"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2146.04" y="1457.83">
                  CC 8
                </tspan>
              </text>
            </g>
            <g id="node_mbt">
              <rect
                x="2136"
                y="1538"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 7"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2142.35" y="1554.83">
                  CC 7
                </tspan>
              </text>
            </g>
            <g id="node_sdm">
              <rect
                x="2113"
                y="1640"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 6"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2118.93" y="1656.83">
                  CC 6
                </tspan>
              </text>
            </g>
            <g id="node_nch">
              <rect
                x="2078"
                y="1734"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 5"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2083.98" y="1750.83">
                  CC 5
                </tspan>
              </text>
            </g>
            <g id="node_epn">
              <rect
                x="1814"
                y="1786"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 3"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1820.06" y="1802.83">
                  CC 3
                </tspan>
              </text>
            </g>
            <g id="node_bbs">
              <rect
                x="1675"
                y="1645"
                width="42"
                height="24"
                rx="10"
                fill="#FF9E18"
              />
              <text
                id="CC 2"
                fill="#383A37"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1681.06" y="1661.83">
                  CC 2
                </tspan>
              </text>
            </g>
            <g id="node_psr">
              <rect
                x="2678"
                y="814"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 1"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2684" y="830.83">
                  EW 1
                </tspan>
              </text>
            </g>
            <g id="node_sim">
              <rect
                x="2678"
                y="991"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 3"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2682.51" y="1007.83">
                  EW 3
                </tspan>
              </text>
            </g>
            <g id="node_bdk">
              <rect
                x="2464"
                y="1048"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 5"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2468.44" y="1064.83">
                  EW 5
                </tspan>
              </text>
            </g>
            <g id="node_kem">
              <rect
                x="2313"
                y="1129"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 6"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2317.38" y="1145.83">
                  EW 6
                </tspan>
              </text>
            </g>
            <g id="node_eun">
              <rect
                x="2220"
                y="1221"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 7"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2224.81" y="1237.83">
                  EW 7
                </tspan>
              </text>
            </g>
            <g id="node_alj">
              <rect
                x="2037"
                y="1405"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 9"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2041.38" y="1421.83">
                  EW 9
                </tspan>
              </text>
            </g>
            <g id="node_kal">
              <rect
                x="1971"
                y="1472"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 10"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1972.65" y="1488.83">
                  EW 10
                </tspan>
              </text>
            </g>
            <g id="node_lvr">
              <rect
                x="1901"
                y="1543"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 11"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1904.42" y="1559.83">
                  EW 11
                </tspan>
              </text>
            </g>
            <g id="node_tpg">
              <rect
                x="1375"
                y="1927"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 15"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1376.86" y="1943.83">
                  EW 15
                </tspan>
              </text>
            </g>
            <g id="node_tib">
              <rect
                x="1153"
                y="1714"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 17"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1155.23" y="1730.83">
                  EW 17
                </tspan>
              </text>
            </g>
            <g id="node_rdh">
              <rect
                x="1084"
                y="1644"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 18"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1085.92" y="1660.83">
                  EW 18
                </tspan>
              </text>
            </g>
            <g id="node_que">
              <rect
                x="1009"
                y="1575"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 19"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="1010.8" y="1591.83">
                  EW 19
                </tspan>
              </text>
            </g>
            <g id="node_com">
              <rect
                x="950"
                y="1518"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 20"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="950.171" y="1534.83">
                  EW 20
                </tspan>
              </text>
            </g>
            <g id="node_dvr">
              <rect
                x="747"
                y="1454"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 22"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="747.465" y="1470.83">
                  EW 22
                </tspan>
              </text>
            </g>
            <g id="node_cle">
              <rect
                x="647"
                y="1454"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 23"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="647.458" y="1470.83">
                  EW 23
                </tspan>
              </text>
            </g>
            <g id="node_cng">
              <rect
                x="377"
                y="1454"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 25"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="377.383" y="1470.83">
                  EW 25
                </tspan>
              </text>
            </g>
            <g id="node_lks">
              <rect
                x="267"
                y="1454"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 26"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="267.328" y="1470.83">
                  EW 26
                </tspan>
              </text>
            </g>
            <g id="node_bnl">
              <rect
                x="164"
                y="1346"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 27"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.82" y="1362.83">
                  EW 27
                </tspan>
              </text>
            </g>
            <g id="node_pnr">
              <rect
                x="164"
                y="1258"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 28"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.444" y="1274.83">
                  EW 28
                </tspan>
              </text>
            </g>
            <g id="node_jkn">
              <rect
                x="164"
                y="1170"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 29"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.328" y="1186.83">
                  EW 29
                </tspan>
              </text>
            </g>
            <g id="node_gcl">
              <rect
                x="164"
                y="1082"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 30"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.164" y="1098.83">
                  EW 30
                </tspan>
              </text>
            </g>
            <g id="node_tcr">
              <rect
                x="164"
                y="995"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 31"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="165.935" y="1011.83">
                  EW 31
                </tspan>
              </text>
            </g>
            <g id="node_twr">
              <rect
                x="164"
                y="907"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 32"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.458" y="923.83">
                  EW 32
                </tspan>
              </text>
            </g>
            <g id="node_tlk">
              <rect
                x="164"
                y="819"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="EW 33"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="164.451" y="835.83">
                  EW 33
                </tspan>
              </text>
            </g>
            <g id="node_cga">
              <rect
                x="2932"
                y="1159"
                width="42"
                height="24"
                rx="10"
                fill="#00953B"
              />
              <text
                id="CG 2"
                fill="white"
                font-family="Radio Canada Big"
                font-size="14"
                font-weight="600"
                letter-spacing="0em"
              >
                <tspan x="2937.81" y="1175.83">
                  CG 2
                </tspan>
              </text>
            </g>
          </g>
        </g>
        <defs>
          <clipPath id="clip0_13_2">
            <rect
              x="1419"
              y="813"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip1_13_2">
            <rect
              x="2172"
              y="467"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip2_13_2">
            <rect
              x="2033"
              y="614"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip3_13_2">
            <rect
              x="1764"
              y="884"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip4_13_2">
            <rect
              x="2047"
              y="1175"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip5_13_2">
            <rect
              x="2094"
              y="1318"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip6_13_2">
            <rect
              x="2637"
              y="1045"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip7_13_2">
            <rect
              x="1968"
              y="1833"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip8_13_2">
            <rect
              x="1838"
              y="1956"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip9_13_2">
            <rect
              x="1169"
              y="1317"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip10_13_2">
            <rect
              x="1629"
              y="1782"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip11_13_2">
            <rect
              x="1627"
              y="1879"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip12_13_2">
            <rect
              x="1189"
              y="2041"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip13_13_2">
            <rect
              x="1412"
              y="1550"
              width="160"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip14_13_2">
            <rect
              x="1220"
              y="1780"
              width="160"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip15_13_2">
            <rect
              x="1656"
              y="2027"
              width="160"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip16_13_2">
            <rect
              x="1314"
              y="1176"
              width="112"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip17_13_2">
            <rect
              x="467"
              y="1451"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip18_13_2">
            <rect
              x="827"
              y="1449"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip19_13_2">
            <rect
              x="947"
              y="1077"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip20_13_2">
            <rect
              x="1525"
              y="1351"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip21_13_2">
            <rect
              x="1791"
              y="1619"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip22_13_2">
            <rect
              x="2790"
              y="1156"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip23_13_2">
            <rect
              x="2716"
              y="1304"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip24_13_2">
            <rect
              x="1337"
              y="1701"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip25_13_2">
            <rect
              x="1144"
              y="1077"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip26_13_2">
            <rect
              x="1144"
              y="903"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip27_13_2">
            <rect
              x="485"
              y="939"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip28_13_2">
            <rect x="715" y="650" width="56" height="78" rx="10" fill="white" />
          </clipPath>
          <clipPath id="clip29_13_2">
            <rect
              x="786"
              y="365"
              width="106"
              height="30"
              rx="10"
              fill="white"
            />
          </clipPath>
        </defs>
      </svg>
      <span className="text-gray-400 text-sm italic dark:text-gray-500">
        <FormattedMessage
          id="general.station_count"
          defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
          values={{
            count: stationCount,
          }}
        />
      </span>
    </div>
  );
};
