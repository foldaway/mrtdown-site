import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedList, FormattedMessage, useIntl } from 'react-intl';
import type { IssueStationEntry, StationTranslatedNames } from '~/types';
import { segmentText } from './helpers/segmentText';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';

interface Props {
  stationIdsAffected: IssueStationEntry[];
  componentIdsAffected: string[];
}

export const StationMap: React.FC<Props> = (props) => {
  const { stationIdsAffected } = props;

  const intl = useIntl();
  const navigate = useNavigate();

  const stationTranslatedNamesQuery = useQuery<StationTranslatedNames>({
    queryKey: ['station-translated-names', intl.locale],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.foldaway.space/product/station_names_${intl.locale}.json`,
      ).then((r) => r.json()),
  });

  const stationTranslatedNames = useMemo(() => {
    return stationTranslatedNamesQuery.data ?? {};
  }, [stationTranslatedNamesQuery.data]);

  const [ref, setRef] = useState<SVGElement | null>(null);

  const stationIds = useMemo(() => {
    const result = new Set<string>();
    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        result.add(stationId);
      }
    }
    return result;
  }, [stationIdsAffected]);

  useEffect(() => {
    if (ref == null) {
      return;
    }

    const linesByStationId: Record<string, Set<string>> = {};
    const linesPatchedByStationId: Record<string, Set<string>> = {};
    const componentByLineId: Record<string, string> = {};

    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        // Retrieve all lines connected to this station
        const lineElements = [
          ...ref.querySelectorAll(`[id^='line_${stationId.toLowerCase()}:']`),
          ...ref.querySelectorAll(`[id$=':${stationId.toLowerCase()}']`),
        ] as SVGGElement[];

        for (const lineElement of lineElements) {
          const linesStation = linesByStationId[stationId] ?? new Set();
          linesStation.add(lineElement.id);
          linesByStationId[stationId] = linesStation;

          const parentElement = lineElement.parentElement;
          if (parentElement != null) {
            const lineComponentId = parentElement.id.replace(/^line_/, '');
            componentByLineId[lineElement.id] = lineComponentId;
          }
        }

        for (const otherStationId of entry.stationIds) {
          if (stationId === otherStationId) {
            continue;
          }

          for (const lineElement of lineElements) {
            switch (lineElement.id) {
              case `line_${stationId.toLowerCase()}:${otherStationId.toLowerCase()}`:
              case `line_${otherStationId.toLowerCase()}:${stationId.toLowerCase()}`: {
                const componentId = componentByLineId[lineElement.id];
                if (
                  componentId != null &&
                  componentId.toLowerCase() !== entry.componentId.toLowerCase()
                ) {
                  continue;
                }

                lineElement.style.opacity = '0.3';

                const linesPatchedStation =
                  linesPatchedByStationId[stationId] ?? new Set();
                linesPatchedStation.add(lineElement.id);
                linesPatchedByStationId[stationId] = linesPatchedStation;
                const linePatchedOtherStation =
                  linesPatchedByStationId[otherStationId] ?? new Set();
                linePatchedOtherStation.add(lineElement.id);
                linesPatchedByStationId[otherStationId] =
                  linePatchedOtherStation;

                break;
              }
            }
          }
        }
      }
    }

    for (const entry of stationIdsAffected) {
      for (const stationId of entry.stationIds) {
        const lines = linesByStationId[stationId] ?? new Set();
        const patchedLines = linesPatchedByStationId[stationId] ?? new Set();

        const nodeElement: SVGGElement | null = ref.querySelector(
          `#node_${stationId.toLowerCase()}`,
        );

        const lineCountForComponent = Array.from(lines).filter((lineId) => {
          const lineComponentId = componentByLineId[lineId];
          return (
            lineComponentId.toLowerCase() === entry.componentId.toLowerCase()
          );
        }).length;

        const patchedLineCountForComponent = Array.from(patchedLines).filter(
          (lineId) => {
            const lineComponentId = componentByLineId[lineId];
            return (
              lineComponentId.toLowerCase() === entry.componentId.toLowerCase()
            );
          },
        ).length;

        if (
          nodeElement != null &&
          patchedLineCountForComponent === lineCountForComponent
        ) {
          // All SVG lines connected to this station for the entry's component have been patched out
          const componentElement: SVGGElement | null =
            nodeElement.querySelector(
              `[id^='${entry.componentId.toLowerCase()}']`,
            );
          if (componentElement != null) {
            // Patch out the section of the station node for the entry's component
            componentElement.style.opacity = '0.3';
          }
        }

        if (patchedLines.size === lines.size) {
          // All SVG lines connected to this station have been patched out
          const labelElement: SVGGElement | null = ref.querySelector(
            `#label_${stationId.toLowerCase()}`,
          );
          if (labelElement != null) {
            // Patch out the station label
            labelElement.style.opacity = '0.3';
          }
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
  }, [ref, stationIdsAffected, stationTranslatedNames, intl.locale, navigate]);

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
        <title>
          {intl.formatMessage({
            id: 'general.system_map',
            defaultMessage: 'System Map',
          })}
        </title>
        <g id="System Map">
          <g id="u/c">
            <line
              id="Line 10"
              x1="2601"
              y1="1416.5"
              x2="2913"
              y2="1416.5"
              stroke="#969696"
            />
            <line
              id="Line 11"
              x1="2784"
              y1="1200.5"
              x2="2913"
              y2="1200.5"
              stroke="#969696"
            />
            <path id="Line 12" d="M2913.5 1200V1417" stroke="#969696" />
            <g id="Frame 2">
              <rect
                x="2892"
                y="1296"
                width="43"
                height="25"
                rx="4"
                fill="#969696"
              />
              <text
                id="U/C"
                fill="white"
                font-family="Radio Canada Big"
                font-size="16"
                font-weight="500"
                letter-spacing="0em"
              >
                <tspan x="2900" y="1314.02">
                  U/C
                </tspan>
              </text>
            </g>
          </g>
          <g id="line_ccl">
            <path
              id="line_cdt:btn"
              d="M1160 937C1160 937 1121 964 1105 978.5C1089 993 1063 1016 1051 1029.5C1039 1043 1013.5 1073.5 1013.5 1073.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_frr:hlv"
              d="M924.871 1233.87C924.871 1233.87 916.5 1256 911 1271.5C905.5 1287 901 1310 901 1310"
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
              d="M878.5 1482C878.5 1482 878.5 1494.5 879.994 1513.5C881.488 1532.5 882 1539.5 882 1539.5"
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
              d="M910 1669.5C910 1669.5 917 1693 919.5 1699.5C922 1706 931.818 1729.97 931.818 1729.97"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_hpv:ppj"
              d="M946.806 1759.36C946.806 1759.36 953.5 1776.5 959 1784.5C964.5 1792.5 971 1805 971 1805"
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
              d="M2052.41 1829.49C2052.41 1829.49 2068.5 1806 2074.5 1795C2080.5 1784 2092 1760 2092 1760"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_nch:sdm"
              d="M2107.5 1728C2107.5 1728 2115 1713 2119.5 1699C2124 1685 2129.62 1665.06 2129.62 1665.06"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_sdm:mbt"
              d="M2139.05 1636.48C2139.05 1636.48 2144.5 1612.5 2146.5 1600C2148.5 1587.5 2151.5 1566.5 2151.5 1566.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_mbt:dkt"
              d="M2155.5 1537C2155.5 1537 2158.43 1515 2158.43 1499.5C2158.43 1484 2158.43 1466.81 2158.43 1466.81"
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
              d="M2015 1061C2015 1061 1996.5 1040 1991 1034C1985.5 1028 1961.8 1005.03 1961.8 1005.03"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_bly:ser"
              d="M1929.77 976.358C1929.77 976.358 1893.5 949 1889 945.5C1884.5 942 1847.28 918.455 1847.28 918.455"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_ser:lrc"
              d="M1773 880.83C1773 880.83 1735 866.5 1728 863.5C1721 860.5 1696.5 851 1696.5 851"
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
              d="M1413.61 836.938C1413.61 836.938 1382 843 1374 845C1366 847 1336.5 855.5 1336.5 855.5"
              stroke="#FF9E18"
              stroke-width="6"
            />
            <path
              id="line_mrm:cdt"
              d="M1279 871C1279 871 1264 876.5 1250.5 884C1237 891.5 1227 898 1227 898"
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
              d="M1196.59 1534C1196.59 1534 1196.59 1605.5 1196.59 1616.5C1196.59 1627.5 1201 1632.5 1206.5 1640.5C1212 1648.5 1222.5 1659 1222.5 1659L1340.59 1776.48"
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
              <path
                id="line_hvw:hme"
                d="M743 830V851"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_hme:btw"
                d="M743 880V903"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_btw:kap"
                d="M743 930V954.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_kap:sav"
                d="M743 982.5V1004"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_sav:tkk"
                d="M742.5 1032C742.5 1032 744.5 1050.5 755.5 1066C766.5 1081.5 772.5 1082.33 782 1086C791.5 1089.67 813 1091 813 1091"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_tkk:btn"
                d="M872 1091L944 1091"
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
                d="M1848 1990C1848 1990 1838.9 1997 1829.9 1999.5C1820.9 2002 1801 2002.94 1801 2002.94"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_dtn:tla"
                d="M1742.5 2003.5C1742.5 2003.5 1719 2003.82 1710 2001C1701 1998.18 1687 1991.5 1682 1987.5C1677 1983.5 1601.38 1910.52 1601.38 1910.52"
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
                d="M1706.15 1594C1706.15 1594 1694 1600 1682 1605.5C1670 1611 1624.5 1609 1624.5 1609L1415 1607.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <line
                id="line_bcl:jlb"
                x1="1784.12"
                y1="1514.79"
                x2="1734.12"
                y2="1564.79"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_jlb:bdm"
                d="M1884.13 1415.11L1815.24 1484"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_bdm:glb"
                d="M1953.81 1346.12L1917.5 1382.43"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_glb:mtr"
                d="M2024.73 1274.92L1985.15 1314.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_mtr:mps"
                d="M2090.96 1209.01L2055.46 1244.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_mps:ubi"
                d="M2166 1134.28L2129.18 1171.1"
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
                d="M2427 941.961C2427 941.961 2388.5 941.961 2385 941.961C2381.5 941.961 2370 944.5 2366 946C2362 947.5 2353 952.5 2353 952.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_bdr:tpw"
                d="M2554.5 942H2484.5"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_tpw:tam"
                d="M2729 942L2613 942"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_tam:tpe"
                d="M2843 989C2843 989 2843.5 979.5 2842 975C2840.5 970.5 2838 963 2834 958.5C2830 954 2814 943.5 2809.5 942.5C2805 941.5 2788 942 2788 942"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_tpe:upc"
                d="M2843 1058.5L2843 1016"
                stroke="#0055B8"
                stroke-width="6"
              />
              <path
                id="line_upc:xpo"
                d="M2843 1153L2843 1088"
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
                d="M702.055 580.467C702.055 580.467 699 573.5 698 570C697 566.5 696.5 559 696.5 559"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_snj:bkp"
                d="M743.227 646.925C743.227 646.925 740.5 633.5 739.5 630C738.5 626.5 735.5 619.5 733 616C730.5 612.5 721 603.5 721 603.5"
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
              <path
                id="line_pnx:bkp"
                d="M713 668L659.5 668"
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
                d="M787.5 557.5C787.5 557.5 787 562.5 786 568.5C785 574.5 782.92 580.56 782.92 580.56"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_pnd:bkt"
                d="M787 511L787 534"
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
              <path
                id="line_sgr:jlp"
                d="M697 535.5L697 510.5"
                stroke="#718472"
                stroke-width="4"
              />
              <path
                id="line_cck:shv"
                d="M568 895.5L568 937"
                stroke="#718472"
                stroke-width="4"
              />
            </g>
            <g id="line_nsl">
              <path
                id="line_jur:bbt"
                d="M520 1285.5L520 1449"
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
                y1="971"
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
              <path
                id="line_ywt:krj"
                d="M520 624L520 762.5"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_krj:msl"
                d="M593.5 435C593.5 435 564.5 465 555.5 479C546.5 493 532 525.501 528 536.5C524 547.5 520 595 520 595"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_msl:wdl"
                d="M781.614 379.936C781.614 379.936 741 379.936 731.5 379.936C722 379.936 686 386 673.5 390C661 394 634.5 406.5 634.5 406.5"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_wdl:adm"
                d="M893 381L953.5 381"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_adm:sbw"
                d="M1010.5 381L1084.5 381"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_sbw:cbr"
                d="M1142.5 381L1219.5 380"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_cbr:yis"
                d="M1276 381.5C1276 381.5 1307.5 386.5 1319.5 390.5C1331.5 394.5 1360.5 410 1360.5 410"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_yis:ktb"
                d="M1403.5 438.5C1403.5 438.5 1419.5 457 1426.5 464.5C1433.5 472 1447 496 1447 496"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_ktb:yck"
                d="M1460.5 526.5C1460.5 526.5 1468 552.5 1469.5 559.5C1471 566.5 1473 599 1473 599"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_yck:amk"
                d="M1473 626.5L1473 699"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_amk:bsh"
                d="M1473 727L1473 811"
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
              <path
                id="line_bdl:tap"
                d="M1473 912.5L1473 978"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_tap:nov"
                d="M1472.5 1006.5C1472.5 1006.5 1472.68 1034 1470 1044C1467.32 1054 1461.5 1059.5 1454.5 1067C1447.5 1074.5 1429.68 1094.34 1429.68 1094.34"
                stroke="#E1251B"
                stroke-width="6"
              />
              <path
                id="line_nov:new"
                d="M1397.5 1124.5L1354.19 1172.05"
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
              <path
                id="line_som:dbg"
                d="M1340.24 1459L1428.09 1546.84"
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
                d="M1666.71 2056.54C1666.71 2056.54 1669 2090.5 1682 2103.5C1695 2116.5 1707.5 2125.58 1726.5 2127.54C1745.5 2129.5 1766 2128.5 1766 2128.5"
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
                d="M185 1372C185 1372 184.5 1404 187.5 1417.5C190.5 1431 202.5 1447 217.5 1457.5C232.5 1468 257.5 1466.5 257.5 1466.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_cng:lks"
                d="M372 1466H314"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_jur:cng"
                d="M464 1466H427.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_cle:jur"
                d="M639.5 1466H575"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_dvr:cle"
                d="M739 1466H695.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_bnv:dvr"
                d="M823 1466H796"
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
              <path
                id="line_que:com"
                d="M1015.92 1572.16L988.5 1546"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_rdh:que"
                d="M1085.26 1640.5L1048 1603.24"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_tib:rdh"
                d="M1158.93 1711.17L1119.5 1673.5"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_otp:tib"
                d="M1225.9 1777.14L1191.5 1742.74"
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
                id="line_rfp:cth"
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
              <path
                id="line_alj:kal"
                d="M2042.5 1433.74L2007.12 1469.12"
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
                d="M2457.5 1059.58C2457.5 1059.58 2441 1059.58 2436 1059.58C2431 1059.58 2419 1063 2411.5 1067C2404 1071 2394.5 1080.5 2394.5 1080.5L2348.55 1127.38"
                stroke="#00953B"
                stroke-width="6"
              />
              <path
                id="line_tnm:bdk"
                d="M2634 1059L2515.5 1059"
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
                d="M2926 1170H2898"
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
              <tspan x="552" y="1277.9">
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
              <tspan x="552" y="1128.9">
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
              <tspan x="607" y="551.02">
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
              <tspan x="632" y="504.02">
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
              <tspan x="1995.38" y="454.02">
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
              <tspan x="1825.48" y="446.02">
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
              <tspan x="1974.2" y="298.02">
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
              <tspan x="1229.29" y="1182.9">
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
              <tspan x="1863" y="1806.9">
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
              <tspan x="1614" y="1664.9">
                Bras&#10;
              </tspan>
              <tspan x="1614" y="1690.9">
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
              <tspan x="2734" y="832.9">
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
              <tspan x="2319" y="431.9">
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
              <tspan x="1751.07" y="999.9">
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
              <tspan x="1666.23" y="1087.9">
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
              <tspan x="1050.22" y="1432.9">
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
              <tspan x="758.355" y="1561.9">
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
              <tspan x="794.031" y="1225.9">
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
              <tspan x="1507.35" y="1901.9">
                Telok&#10;
              </tspan>
              <tspan x="1510.89" y="1927.9">
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
              <tspan x="1060.44" y="1594.9">
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
              <tspan x="1002.24" y="1536.9">
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
              <tspan x="1471" y="1663.9">
                Clarke&#10;
              </tspan>
              <tspan x="1471" y="1689.9">
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
                <g id="ccl_7">
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
                <g id="nel_4">
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
                <g id="nel_5">
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
                <g id="ccl_8">
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
                <g id="nel_6">
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
                <g id="ccl_9">
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
                <g id="ccl_10">
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
                <g id="ccl_11">
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
                <g id="nel_7">
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
                <g id="nel_8">
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
                <g id="ccl_12">
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
            <g id="node_twr">
              <g clip-path="url(#clip30_13_2)">
                <g id="ewl_12">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 907)"
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
                    <tspan x="164.208" y="923.83">
                      EW 32
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_tcr">
              <g clip-path="url(#clip31_13_2)">
                <g id="ewl_13">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 995)"
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
                    <tspan x="165.685" y="1011.83">
                      EW 31
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_gcl">
              <g clip-path="url(#clip32_13_2)">
                <g id="ewl_14">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 1082)"
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
                    <tspan x="163.914" y="1098.83">
                      EW 30
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_jkn">
              <g clip-path="url(#clip33_13_2)">
                <g id="ewl_15">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 1170)"
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
                    <tspan x="164.078" y="1186.83">
                      EW 29
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_pnr">
              <g clip-path="url(#clip34_13_2)">
                <g id="ewl_16">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 1258)"
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
                    <tspan x="164.194" y="1274.83">
                      EW 28
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_bnl">
              <g clip-path="url(#clip35_13_2)">
                <g id="ewl_17">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 1346)"
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
                    <tspan x="164.57" y="1362.83">
                      EW 27
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
            <g id="node_tlk">
              <g clip-path="url(#clip36_13_2)">
                <g id="ewl_18">
                  <rect
                    width="53.5"
                    height="24"
                    transform="translate(158 819)"
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
                    <tspan x="164.201" y="835.83">
                      EW 33
                    </tspan>
                  </text>
                </g>
              </g>
            </g>
          </g>
          <g id="node_lks">
            <g clip-path="url(#clip37_13_2)">
              <g id="ewl_19">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(259 1454)"
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
                  <tspan x="265.078" y="1470.83">
                    EW 26
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cng">
            <g clip-path="url(#clip38_13_2)">
              <g id="ewl_20">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(373 1454)"
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
                  <tspan x="379.133" y="1470.83">
                    EW 25
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cle">
            <g clip-path="url(#clip39_13_2)">
              <g id="ewl_21">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(641 1454)"
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
                  <tspan x="647.208" y="1470.83">
                    EW 23
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bbt">
            <g clip-path="url(#clip40_13_2)">
              <g id="nsl_11">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(493 1259)"
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
                  <tspan x="505.046" y="1275.83">
                    NS 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bgb">
            <g clip-path="url(#clip41_13_2)">
              <g id="nsl_12">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(493 1110)"
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
                  <tspan x="505.039" y="1126.83">
                    NS 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ywt">
            <g clip-path="url(#clip42_13_2)">
              <g id="nsl_13">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(493 764)"
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
                  <tspan x="504.964" y="780.83">
                    NS 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_shv">
            <g clip-path="url(#clip43_13_2)">
              <g id="bplrt_3">
                <rect
                  width="32"
                  height="20"
                  transform="translate(552 874)"
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
                  <tspan x="555.801" y="888.14">
                    BP 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kth">
            <g clip-path="url(#clip44_13_2)">
              <g id="bplrt_4">
                <rect
                  width="32"
                  height="20"
                  transform="translate(552 801)"
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
                  <tspan x="555.795" y="815.14">
                    BP 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tkw">
            <g clip-path="url(#clip46_13_2)">
              <g id="bplrt_6">
                <rect
                  width="32"
                  height="20"
                  transform="translate(552 733)"
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
                  <tspan x="555.871" y="747.14">
                    BP 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_pnx">
            <g clip-path="url(#clip47_13_2)">
              <g id="bplrt_7">
                <rect
                  width="32"
                  height="20"
                  transform="translate(625 657)"
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
                  <tspan x="628.73" y="671.14">
                    BP 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ptr">
            <g clip-path="url(#clip48_13_2)">
              <g id="bplrt_8">
                <rect
                  width="32"
                  height="20"
                  transform="translate(763 582)"
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
                  <tspan x="767.047" y="596.14">
                    BP 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_pnd">
            <g clip-path="url(#clip49_13_2)">
              <g id="bplrt_9">
                <rect
                  width="32"
                  height="20"
                  transform="translate(771 536)"
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
                  <tspan x="774.783" y="550.14">
                    BP 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bkt">
            <g clip-path="url(#clip50_13_2)">
              <g id="bplrt_10">
                <rect
                  width="32"
                  height="20"
                  transform="translate(771 489)"
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
                  <tspan x="774.684" y="503.14">
                    BP 9
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_fjr">
            <g clip-path="url(#clip51_13_2)">
              <g id="bplrt_11">
                <rect
                  width="32"
                  height="20"
                  transform="translate(727 442)"
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
                  <tspan x="728.34" y="456.14">
                    BP 10
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sgr">
            <g clip-path="url(#clip52_13_2)">
              <g id="bplrt_12">
                <rect
                  width="32"
                  height="20"
                  transform="translate(682 489)"
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
                  <tspan x="684.857" y="503.14">
                    BP 11
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_jlp">
            <g clip-path="url(#clip53_13_2)">
              <g id="bplrt_13">
                <rect
                  width="32"
                  height="20"
                  transform="translate(680 536)"
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
                  <tspan x="681.592" y="550.14">
                    BP 12
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_snj">
            <g clip-path="url(#clip54_13_2)">
              <g id="bplrt_14">
                <rect
                  width="32"
                  height="20"
                  transform="translate(691 582)"
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
                  <tspan x="692.586" y="596.14">
                    BP 13
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_smd">
            <g clip-path="url(#clip55_13_2)">
              <g id="pglrt_2">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2053 283)"
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
                  <tspan x="2054.94" y="297.14">
                    PW 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_pgp">
            <g clip-path="url(#clip56_13_2)">
              <g id="pglrt_3">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2111 279)"
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
                  <tspan x="2112.87" y="293.14">
                    PW 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tkl">
            <g clip-path="url(#clip57_13_2)">
              <g id="pglrt_4">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2150 315)"
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
                  <tspan x="2151.87" y="329.14">
                    PW 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_smk">
            <g clip-path="url(#clip58_13_2)">
              <g id="pglrt_5">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2183 350)"
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
                  <tspan x="2186.14" y="364.14">
                    PW 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_dam">
            <g clip-path="url(#clip59_13_2)">
              <g id="pglrt_6">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2340 507)"
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
                  <tspan x="2344.15" y="521.14">
                    PE 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_oas">
            <g clip-path="url(#clip60_13_2)">
              <g id="pglrt_7">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2376 541)"
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
                  <tspan x="2379.78" y="555.14">
                    PE 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kdl">
            <g clip-path="url(#clip61_13_2)">
              <g id="pglrt_8">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2412 577)"
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
                  <tspan x="2415.83" y="591.14">
                    PE 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_riv">
            <g clip-path="url(#clip62_13_2)">
              <g id="pglrt_9">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2411 635)"
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
                  <tspan x="2414.97" y="649.14">
                    PE 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cre">
            <g clip-path="url(#clip63_13_2)">
              <g id="pglrt_10">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2344 634)"
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
                  <tspan x="2347.89" y="648.14">
                    PE 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mrd">
            <g clip-path="url(#clip64_13_2)">
              <g id="pglrt_11">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2310 599)"
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
                  <tspan x="2313.9" y="613.14">
                    PE 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cov">
            <g clip-path="url(#clip65_13_2)">
              <g id="pglrt_12">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2278 553)"
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
                  <tspan x="2283.17" y="567.14">
                    PE 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cgl">
            <g clip-path="url(#clip66_13_2)">
              <g id="sklrt_2">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2024 510)"
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
                  <tspan x="2027.17" y="524.14">
                    SW 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_fmw">
            <g clip-path="url(#clip67_13_2)">
              <g id="sklrt_3">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1991 475)"
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
                  <tspan x="1992.9" y="489.14">
                    SW 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kpg">
            <g clip-path="url(#clip68_13_2)">
              <g id="sklrt_4">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1958 439)"
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
                  <tspan x="1959.9" y="453.14">
                    SW 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tng">
            <g clip-path="url(#clip69_13_2)">
              <g id="sklrt_5">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1909 431)"
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
                  <tspan x="1910.97" y="445.14">
                    SW 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_fnv">
            <g clip-path="url(#clip70_13_2)">
              <g id="sklrt_6">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1878 463)"
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
                  <tspan x="1879.83" y="477.14">
                    SW 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_lyr">
            <g clip-path="url(#clip71_13_2)">
              <g id="sklrt_7">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1897 504)"
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
                  <tspan x="1898.79" y="518.14">
                    SW 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tkg">
            <g clip-path="url(#clip72_13_2)">
              <g id="sklrt_8">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1929 538)"
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
                  <tspan x="1931.15" y="552.14">
                    SW 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_rnj">
            <g clip-path="url(#clip73_13_2)">
              <g id="sklrt_9">
                <rect
                  width="32"
                  height="20"
                  transform="translate(1961 570)"
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
                  <tspan x="1962.88" y="584.14">
                    SW 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cpv">
            <g clip-path="url(#clip74_13_2)">
              <g id="sklrt_10">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2206 689)"
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
                  <tspan x="2211.25" y="703.14">
                    SE 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_rmb">
            <g clip-path="url(#clip75_13_2)">
              <g id="sklrt_11">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2245 728)"
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
                  <tspan x="2248.99" y="742.14">
                    SE 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bak">
            <g clip-path="url(#clip76_13_2)">
              <g id="sklrt_12">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2246 794)"
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
            </g>
          </g>
          <g id="node_kgk">
            <g clip-path="url(#clip77_13_2)">
              <g id="sklrt_13">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2177 785)"
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
                  <tspan x="2181.06" y="799.14">
                    SE 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_rng">
            <g clip-path="url(#clip78_13_2)">
              <g id="sklrt_14">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2134 743)"
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
                  <tspan x="2137.92" y="757.14">
                    SE 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_nbg">
            <g clip-path="url(#clip79_13_2)">
              <g id="pglrt_13">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2048 342)"
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
                  <tspan x="2049.8" y="356.14">
                    PW 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_smg">
            <g clip-path="url(#clip80_13_2)">
              <g id="pglrt_14">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2082 373)"
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
                  <tspan x="2083.76" y="387.14">
                    PW 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_stk">
            <g clip-path="url(#clip81_13_2)">
              <g id="pglrt_15">
                <rect
                  width="32"
                  height="20"
                  transform="translate(2119 404)"
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
                  <tspan x="2121.12" y="418.14">
                    PW 7{' '}
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_krj">
            <g clip-path="url(#clip82_13_2)">
              <g id="nsl_14">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(493 598)"
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
                  <tspan x="505.333" y="614.83">
                    NS 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_msl">
            <g clip-path="url(#clip83_13_2)">
              <g id="nsl_15">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(585 408)"
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
                  <tspan x="597.025" y="424.83">
                    NS 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_wdn">
            <g clip-path="url(#clip84_13_2)">
              <g id="tel_8">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(714 268)"
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
                  <tspan x="728.363" y="284.83">
                    TE 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_wds">
            <g clip-path="url(#clip85_13_2)">
              <g id="tel_9">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(867 433)"
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
                  <tspan x="879.88" y="449.83">
                    TE 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_spl">
            <g clip-path="url(#clip86_13_2)">
              <g id="tel_10">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(927 497)"
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
                  <tspan x="939.969" y="513.83">
                    TE 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ltr">
            <g clip-path="url(#clip87_13_2)">
              <g id="tel_11">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(989 559)"
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
                  <tspan x="1001.8" y="575.83">
                    TE 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mfl">
            <g clip-path="url(#clip88_13_2)">
              <g id="tel_12">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1050 622)"
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
                  <tspan x="1062.75" y="638.83">
                    TE 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_brh">
            <g clip-path="url(#clip89_13_2)">
              <g id="tel_13">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1113 687)"
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
                  <tspan x="1126.17" y="703.83">
                    TE 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_uts">
            <g clip-path="url(#clip90_13_2)">
              <g id="tel_14">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1170 800)"
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
                  <tspan x="1182.87" y="816.83">
                    TE 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_npr">
            <g clip-path="url(#clip91_13_2)">
              <g id="tel_15">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1170 1164)"
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
                  <tspan x="1180.31" y="1180.83">
                    TE 12
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_obv">
            <g clip-path="url(#clip92_13_2)">
              <g id="tel_16">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1170 1242)"
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
                  <tspan x="1180.3" y="1258.83">
                    TE 13
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_grw">
            <g clip-path="url(#clip93_13_2)">
              <g id="tel_17">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1170 1414)"
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
                  <tspan x="1180.23" y="1430.83">
                    TE 15
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hvl">
            <g clip-path="url(#clip94_13_2)">
              <g id="tel_18">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1170 1508)"
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
                  <tspan x="1180.17" y="1524.83">
                    TE 16
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_max">
            <g clip-path="url(#clip95_13_2)">
              <g id="tel_19">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1383 1837)"
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
                  <tspan x="1393.29" y="1853.83">
                    TE 18
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_crq">
            <g clip-path="url(#clip96_13_2)">
              <g id="nel_9">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1414 1645)"
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
                  <tspan x="1425.93" y="1661.83">
                    NE 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_frp">
            <g clip-path="url(#clip97_13_2)">
              <g id="nel_10">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1548 1257)"
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
                  <tspan x="1559.99" y="1273.83">
                    NE 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bnk">
            <g clip-path="url(#clip98_13_2)">
              <g id="nel_11">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1548 1166)"
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
                  <tspan x="1559.88" y="1182.83">
                    NE 9
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ptp">
            <g clip-path="url(#clip99_13_2)">
              <g id="nel_12">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1605 1070)"
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
                  <tspan x="1614.14" y="1086.83">
                    NE 10
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_wlh">
            <g clip-path="url(#clip100_13_2)">
              <g id="nel_13">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1691 981)"
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
                  <tspan x="1701.91" y="997.83">
                    NE 11
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kvn">
            <g clip-path="url(#clip101_13_2)">
              <g id="nel_14">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1867 810)"
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
                  <tspan x="1876.43" y="826.83">
                    NE 13
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hgn">
            <g clip-path="url(#clip102_13_2)">
              <g id="nel_15">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1932 744)"
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
                  <tspan x="1941.52" y="760.83">
                    NE 14
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bgk">
            <g clip-path="url(#clip103_13_2)">
              <g id="nel_16">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1996 681)"
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
                  <tspan x="2005.35" y="697.83">
                    NE 15
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_pgc">
            <g clip-path="url(#clip104_13_2)">
              <g id="nel_17">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2260 413)"
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
                  <tspan x="2269.41" y="429.83">
                    NE 18
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_shw">
            <g clip-path="url(#clip105_13_2)">
              <g id="tel_20">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1540 1988)"
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
                  <tspan x="1550.17" y="2004.83">
                    TE 19
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_grb">
            <g clip-path="url(#clip106_13_2)">
              <g id="tel_21">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2097 1950)"
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
                  <tspan x="2105.83" y="1966.83">
                    TE 22
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_trh">
            <g clip-path="url(#clip107_13_2)">
              <g id="tel_22">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2254 1797)"
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
                  <tspan x="2262.83" y="1813.83">
                    TE 23
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ktp">
            <g clip-path="url(#clip108_13_2)">
              <g id="tel_23">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2309 1735)"
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
                  <tspan x="2318.05" y="1751.83">
                    TE 24
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tkt">
            <g clip-path="url(#clip109_13_2)">
              <g id="tel_24">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2370 1674)"
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
                  <tspan x="2378.75" y="1690.83">
                    TE 25
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mpr">
            <g clip-path="url(#clip110_13_2)">
              <g id="tel_25">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2429 1614)"
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
                  <tspan x="2437.7" y="1630.83">
                    TE 26
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mtc">
            <g clip-path="url(#clip111_13_2)">
              <g id="tel_26">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2496 1552)"
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
                  <tspan x="2505.19" y="1568.83">
                    TE 27
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sgl">
            <g clip-path="url(#clip112_13_2)">
              <g id="tel_27">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2558 1491)"
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
                  <tspan x="2566.81" y="1507.83">
                    TE 28
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bsr">
            <g clip-path="url(#clip113_13_2)">
              <g id="tel_28">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2609 1436)"
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
                  <tspan x="2617.7" y="1452.83">
                    TE 29
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bds">
            <g clip-path="url(#clip114_13_2)">
              <g id="tel_29">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2667 1380)"
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
                  <tspan x="2675.53" y="1396.83">
                    TE 30
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_adm">
            <g clip-path="url(#clip115_13_2)">
              <g id="nsl_16">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(955 368)"
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
                  <tspan x="964.175" y="384.83">
                    NS 10
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sbw">
            <g clip-path="url(#clip116_13_2)">
              <g id="nsl_17">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1087 368)"
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
                  <tspan x="1097.95" y="384.83">
                    NS 11
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cbr">
            <g clip-path="url(#clip117_13_2)">
              <g id="nsl_18">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1221 368)"
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
                  <tspan x="1230.47" y="384.83">
                    NS 12
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_yis">
            <g clip-path="url(#clip118_13_2)">
              <g id="nsl_19">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1355 413)"
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
                  <tspan x="1364.46" y="429.83">
                    NS 13
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ktb">
            <g clip-path="url(#clip119_13_2)">
              <g id="nsl_20">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1424 499)"
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
                  <tspan x="1433.55" y="515.83">
                    NS 14
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_yck">
            <g clip-path="url(#clip120_13_2)">
              <g id="nsl_21">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1446 601)"
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
                  <tspan x="1455.39" y="617.83">
                    NS 15
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_amk">
            <g clip-path="url(#clip121_13_2)">
              <g id="nsl_22">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1446 701)"
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
                  <tspan x="1455.33" y="717.83">
                    NS 16
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bdl">
            <g clip-path="url(#clip122_13_2)">
              <g id="nsl_23">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1446 886)"
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
                  <tspan x="1455.45" y="902.83">
                    NS 18
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tap">
            <g clip-path="url(#clip123_13_2)">
              <g id="nsl_24">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1446 980)"
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
                  <tspan x="1455.33" y="996.83">
                    NS 19
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_nov">
            <g clip-path="url(#clip124_13_2)">
              <g id="nsl_25">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1387 1097)"
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
                  <tspan x="1394.7" y="1113.83">
                    NS 20
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_som">
            <g clip-path="url(#clip125_13_2)">
              <g id="nsl_26">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1293 1431)"
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
                  <tspan x="1300.99" y="1447.83">
                    NS 23
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_msp">
            <g clip-path="url(#clip126_13_2)">
              <g id="nsl_27">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1769 2116)"
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
                  <tspan x="1776.97" y="2132.83">
                    NS 28
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_csw">
            <g clip-path="url(#clip127_13_2)">
              <g id="dtl_14">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 755)"
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
                  <tspan x="728.518" y="771.83">
                    DT 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hvw">
            <g clip-path="url(#clip128_13_2)">
              <g id="dtl_15">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 804)"
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
                  <tspan x="728.511" y="820.83">
                    DT 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hme">
            <g clip-path="url(#clip129_13_2)">
              <g id="dtl_16">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 853)"
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
                  <tspan x="728.6" y="869.83">
                    DT 4
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_btw">
            <g clip-path="url(#clip130_13_2)">
              <g id="dtl_17">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 904)"
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
                  <tspan x="728.436" y="920.83">
                    DT 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kap">
            <g clip-path="url(#clip131_13_2)">
              <g id="dtl_18">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 956)"
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
                  <tspan x="728.381" y="972.83">
                    DT 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sav">
            <g clip-path="url(#clip132_13_2)">
              <g id="dtl_19">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(716 1006)"
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
                  <tspan x="728.805" y="1022.83">
                    DT 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tkk">
            <g clip-path="url(#clip133_13_2)">
              <g id="dtl_20">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(816 1080)"
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
                  <tspan x="828.497" y="1096.83">
                    DT 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_rcr">
            <g clip-path="url(#clip134_13_2)">
              <g id="dtl_21">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1639 1446)"
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
                  <tspan x="1648.93" y="1462.83">
                    DT 13
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_dtn">
            <g clip-path="url(#clip135_13_2)">
              <g id="dtl_22">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1745 1992)"
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
                  <tspan x="1755.23" y="2008.83">
                    DT 17
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tla">
            <g clip-path="url(#clip136_13_2)">
              <g id="dtl_23">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1563 1884)"
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
                  <tspan x="1572.92" y="1900.83">
                    DT 18
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_fcn">
            <g clip-path="url(#clip137_13_2)">
              <g id="dtl_24">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1359 1595)"
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
                  <tspan x="1367.17" y="1611.83">
                    DT 20
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bcl">
            <g clip-path="url(#clip138_13_2)">
              <g id="dtl_25">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1696 1568)"
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
                  <tspan x="1705.94" y="1584.83">
                    DT 21
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_jlb">
            <g clip-path="url(#clip139_13_2)">
              <g id="dtl_26">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1769 1488)"
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
                  <tspan x="1777.46" y="1504.83">
                    DT 22
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bdm">
            <g clip-path="url(#clip140_13_2)">
              <g id="dtl_27">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1876 1386)"
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
                  <tspan x="1884.46" y="1402.83">
                    DT 23
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_glb">
            <g clip-path="url(#clip141_13_2)">
              <g id="dtl_28">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1940 1318)"
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
                  <tspan x="1948.68" y="1334.83">
                    DT 24
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mtr">
            <g clip-path="url(#clip142_13_2)">
              <g id="dtl_29">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2014 1248)"
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
                  <tspan x="2022.38" y="1264.83">
                    DT 25
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ubi">
            <g clip-path="url(#clip143_13_2)">
              <g id="dtl_30">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2153 1106)"
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
                  <tspan x="2161.82" y="1122.83">
                    DT 27
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kkb">
            <g clip-path="url(#clip144_13_2)">
              <g id="dtl_31">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2230 1025)"
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
                  <tspan x="2238.44" y="1041.83">
                    DT 28
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bdn">
            <g clip-path="url(#clip145_13_2)">
              <g id="dtl_32">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2306 955)"
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
                  <tspan x="2314.33" y="971.83">
                    DT 29
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bdr">
            <g clip-path="url(#clip146_13_2)">
              <g id="dtl_33">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2429 931)"
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
                  <tspan x="2437.16" y="947.83">
                    DT 30
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tpw">
            <g clip-path="url(#clip147_13_2)">
              <g id="dtl_34">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2557 931)"
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
                  <tspan x="2566.93" y="947.83">
                    DT 31
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tpe">
            <g clip-path="url(#clip148_13_2)">
              <g id="dtl_35">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2816 991)"
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
                  <tspan x="2824.45" y="1007.83">
                    DT 33
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_upc">
            <g clip-path="url(#clip149_13_2)">
              <g id="dtl_36">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2816 1061)"
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
                  <tspan x="2824.54" y="1077.83">
                    DT 34
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_xln">
            <g clip-path="url(#clip150_13_2)">
              <g id="dtl_37">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2799 1248)"
                  fill="#0055B8"
                />
                <text
                  id="DT 34_2"
                  fill="white"
                  font-family="Radio Canada Big"
                  font-size="14"
                  font-weight="600"
                  letter-spacing="0em"
                >
                  <tspan x="2807.54" y="1264.83">
                    DT 34
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_dvr">
            <g clip-path="url(#clip151_13_2)">
              <g id="ewl_22">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(741 1454)"
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
                  <tspan x="747.215" y="1470.83">
                    EW 22
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_com">
            <g clip-path="url(#clip152_13_2)">
              <g id="ewl_23">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(944 1519)"
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
                  <tspan x="949.921" y="1535.83">
                    EW 20
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_que">
            <g clip-path="url(#clip153_13_2)">
              <g id="ewl_24">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1002 1576)"
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
                  <tspan x="1009.55" y="1592.83">
                    EW 19
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_rdh">
            <g clip-path="url(#clip154_13_2)">
              <g id="ewl_25">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1077 1645)"
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
                  <tspan x="1084.67" y="1661.83">
                    EW 18
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tib">
            <g clip-path="url(#clip155_13_2)">
              <g id="ewl_26">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1148 1715)"
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
                  <tspan x="1155.98" y="1731.83">
                    EW 17
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tlb">
            <g clip-path="url(#clip156_13_2)">
              <g id="ccl_13">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1097 1963)"
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
                  <tspan x="1104.74" y="1979.83">
                    CC 28
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_lbd">
            <g clip-path="url(#clip157_13_2)">
              <g id="ccl_14">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1021 1889)"
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
                  <tspan x="1029.12" y="1905.83">
                    CC 27
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_ppj">
            <g clip-path="url(#clip158_13_2)">
              <g id="ccl_15">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(955 1808)"
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
                  <tspan x="962.623" y="1824.83">
                    CC 26
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hpv">
            <g clip-path="url(#clip159_13_2)">
              <g id="ccl_16">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(911 1732)"
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
                  <tspan x="918.678" y="1748.83">
                    CC 25
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_krg">
            <g clip-path="url(#clip160_13_2)">
              <g id="ccl_17">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(878 1643)"
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
                  <tspan x="885.979" y="1659.83">
                    CC 24
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_onh">
            <g clip-path="url(#clip161_13_2)">
              <g id="ccl_18">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(857 1543)"
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
                  <tspan x="864.753" y="1559.83">
                    CC 23
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_hlv">
            <g clip-path="url(#clip162_13_2)">
              <g id="ccl_19">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(872 1313)"
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
                  <tspan x="881.236" y="1329.83">
                    CC 21
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_frr">
            <g clip-path="url(#clip163_13_2)">
              <g id="ccl_20">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(907 1207)"
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
                  <tspan x="914.466" y="1223.83">
                    CC 20
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mrm">
            <g clip-path="url(#clip164_13_2)">
              <g id="ccl_21">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1282 851)"
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
                  <tspan x="1291.1" y="867.83">
                    CC 16
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_lrc">
            <g clip-path="url(#clip165_13_2)">
              <g id="ccl_22">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1642 830)"
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
                  <tspan x="1651.32" y="846.83">
                    CC 14
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bly">
            <g clip-path="url(#clip166_13_2)">
              <g id="ccl_23">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1918 980)"
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
                  <tspan x="1927.24" y="996.83">
                    CC 12
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tsg">
            <g clip-path="url(#clip167_13_2)">
              <g id="ccl_24">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2001 1065)"
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
                  <tspan x="2011.71" y="1081.83">
                    CC 11
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_dkt">
            <g clip-path="url(#clip168_13_2)">
              <g id="ccl_25">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2132 1442)"
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
                  <tspan x="2143.79" y="1458.83">
                    CC 8
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_mbt">
            <g clip-path="url(#clip169_13_2)">
              <g id="ccl_26">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2127 1540)"
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
                  <tspan x="2139.1" y="1556.83">
                    CC 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sdm">
            <g clip-path="url(#clip170_13_2)">
              <g id="ccl_27">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2105 1640)"
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
                  <tspan x="2116.68" y="1656.83">
                    CC 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_nch">
            <g clip-path="url(#clip171_13_2)">
              <g id="ccl_28">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2067 1732)"
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
                  <tspan x="2078.73" y="1748.83">
                    CC 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_epn">
            <g clip-path="url(#clip172_13_2)">
              <g id="ccl_29">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1806 1787)"
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
                  <tspan x="1817.81" y="1803.83">
                    CC 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bbs">
            <g clip-path="url(#clip173_13_2)">
              <g id="ccl_30">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1671 1645)"
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
                  <tspan x="1682.81" y="1661.83">
                    CC 2
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_tpg">
            <g clip-path="url(#clip174_13_2)">
              <g id="ewl_27">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1370 1929)"
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
                  <tspan x="1377.61" y="1945.83">
                    EW 15
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_lvr">
            <g clip-path="url(#clip175_13_2)">
              <g id="ewl_28">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1894 1543)"
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
                  <tspan x="1903.17" y="1559.83">
                    EW 11
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kal">
            <g clip-path="url(#clip176_13_2)">
              <g id="ewl_29">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(1965 1472)"
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
                  <tspan x="1972.4" y="1488.83">
                    EW 10
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_alj">
            <g clip-path="url(#clip177_13_2)">
              <g id="ewl_30">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2035 1407)"
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
                  <tspan x="2045.13" y="1423.83">
                    EW 9
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_eun">
            <g clip-path="url(#clip178_13_2)">
              <g id="ewl_31">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2214 1222)"
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
                  <tspan x="2224.56" y="1238.83">
                    EW 7
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_kem">
            <g clip-path="url(#clip179_13_2)">
              <g id="ewl_32">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2308 1129)"
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
                  <tspan x="2318.13" y="1145.83">
                    EW 6
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_bdk">
            <g clip-path="url(#clip180_13_2)">
              <g id="ewl_33">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2460 1048)"
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
                  <tspan x="2470.19" y="1064.83">
                    EW 5
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_sim">
            <g clip-path="url(#clip181_13_2)">
              <g id="ewl_34">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2675 990)"
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
                  <tspan x="2685.26" y="1006.83">
                    EW 3
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_psr">
            <g clip-path="url(#clip182_13_2)">
              <g id="ewl_35">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2675 814)"
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
                  <tspan x="2686.75" y="830.83">
                    EW 1
                  </tspan>
                </text>
              </g>
            </g>
          </g>
          <g id="node_cga">
            <g clip-path="url(#clip183_13_2)">
              <g id="ewl_36">
                <rect
                  width="53.5"
                  height="24"
                  transform="translate(2928 1158)"
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
                  <tspan x="2939.56" y="1174.83">
                    CG 2
                  </tspan>
                </text>
              </g>
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
          <clipPath id="clip30_13_2">
            <rect
              x="158"
              y="907"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip31_13_2">
            <rect
              x="158"
              y="995"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip32_13_2">
            <rect
              x="158"
              y="1082"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip33_13_2">
            <rect
              x="158"
              y="1170"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip34_13_2">
            <rect
              x="158"
              y="1258"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip35_13_2">
            <rect
              x="158"
              y="1346"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip36_13_2">
            <rect
              x="158"
              y="819"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip37_13_2">
            <rect
              x="259"
              y="1454"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip38_13_2">
            <rect
              x="373"
              y="1454"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip39_13_2">
            <rect
              x="641"
              y="1454"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip40_13_2">
            <rect
              x="493"
              y="1259"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip41_13_2">
            <rect
              x="493"
              y="1110"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip42_13_2">
            <rect
              x="493"
              y="764"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip43_13_2">
            <rect x="552" y="874" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip44_13_2">
            <rect x="552" y="801" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip45_13_2">
            <rect x="552" y="801" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip46_13_2">
            <rect x="552" y="733" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip47_13_2">
            <rect x="625" y="657" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip48_13_2">
            <rect x="763" y="582" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip49_13_2">
            <rect x="771" y="536" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip50_13_2">
            <rect x="771" y="489" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip51_13_2">
            <rect x="727" y="442" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip52_13_2">
            <rect x="682" y="489" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip53_13_2">
            <rect x="680" y="536" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip54_13_2">
            <rect x="691" y="582" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip55_13_2">
            <rect x="2053" y="283" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip56_13_2">
            <rect x="2111" y="279" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip57_13_2">
            <rect x="2150" y="315" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip58_13_2">
            <rect x="2183" y="350" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip59_13_2">
            <rect x="2340" y="507" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip60_13_2">
            <rect x="2376" y="541" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip61_13_2">
            <rect x="2412" y="577" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip62_13_2">
            <rect x="2411" y="635" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip63_13_2">
            <rect x="2344" y="634" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip64_13_2">
            <rect x="2310" y="599" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip65_13_2">
            <rect x="2278" y="553" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip66_13_2">
            <rect x="2024" y="510" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip67_13_2">
            <rect x="1991" y="475" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip68_13_2">
            <rect x="1958" y="439" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip69_13_2">
            <rect x="1909" y="431" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip70_13_2">
            <rect x="1878" y="463" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip71_13_2">
            <rect x="1897" y="504" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip72_13_2">
            <rect x="1929" y="538" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip73_13_2">
            <rect x="1961" y="570" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip74_13_2">
            <rect x="2206" y="689" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip75_13_2">
            <rect x="2245" y="728" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip76_13_2">
            <rect x="2246" y="794" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip77_13_2">
            <rect x="2177" y="785" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip78_13_2">
            <rect x="2134" y="743" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip79_13_2">
            <rect x="2048" y="342" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip80_13_2">
            <rect x="2082" y="373" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip81_13_2">
            <rect x="2119" y="404" width="32" height="20" rx="6" fill="white" />
          </clipPath>
          <clipPath id="clip82_13_2">
            <rect
              x="493"
              y="598"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip83_13_2">
            <rect
              x="585"
              y="408"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip84_13_2">
            <rect
              x="714"
              y="268"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip85_13_2">
            <rect
              x="867"
              y="433"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip86_13_2">
            <rect
              x="927"
              y="497"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip87_13_2">
            <rect
              x="989"
              y="559"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip88_13_2">
            <rect
              x="1050"
              y="622"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip89_13_2">
            <rect
              x="1113"
              y="687"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip90_13_2">
            <rect
              x="1170"
              y="800"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip91_13_2">
            <rect
              x="1170"
              y="1164"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip92_13_2">
            <rect
              x="1170"
              y="1242"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip93_13_2">
            <rect
              x="1170"
              y="1414"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip94_13_2">
            <rect
              x="1170"
              y="1508"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip95_13_2">
            <rect
              x="1383"
              y="1837"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip96_13_2">
            <rect
              x="1414"
              y="1645"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip97_13_2">
            <rect
              x="1548"
              y="1257"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip98_13_2">
            <rect
              x="1548"
              y="1166"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip99_13_2">
            <rect
              x="1605"
              y="1070"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip100_13_2">
            <rect
              x="1691"
              y="981"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip101_13_2">
            <rect
              x="1867"
              y="810"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip102_13_2">
            <rect
              x="1932"
              y="744"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip103_13_2">
            <rect
              x="1996"
              y="681"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip104_13_2">
            <rect
              x="2260"
              y="413"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip105_13_2">
            <rect
              x="1540"
              y="1988"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip106_13_2">
            <rect
              x="2097"
              y="1950"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip107_13_2">
            <rect
              x="2254"
              y="1797"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip108_13_2">
            <rect
              x="2309"
              y="1735"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip109_13_2">
            <rect
              x="2370"
              y="1674"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip110_13_2">
            <rect
              x="2429"
              y="1614"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip111_13_2">
            <rect
              x="2496"
              y="1552"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip112_13_2">
            <rect
              x="2558"
              y="1491"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip113_13_2">
            <rect
              x="2609"
              y="1436"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip114_13_2">
            <rect
              x="2667"
              y="1380"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip115_13_2">
            <rect
              x="955"
              y="368"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip116_13_2">
            <rect
              x="1087"
              y="368"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip117_13_2">
            <rect
              x="1221"
              y="368"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip118_13_2">
            <rect
              x="1355"
              y="413"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip119_13_2">
            <rect
              x="1424"
              y="499"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip120_13_2">
            <rect
              x="1446"
              y="601"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip121_13_2">
            <rect
              x="1446"
              y="701"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip122_13_2">
            <rect
              x="1446"
              y="886"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip123_13_2">
            <rect
              x="1446"
              y="980"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip124_13_2">
            <rect
              x="1387"
              y="1097"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip125_13_2">
            <rect
              x="1293"
              y="1431"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip126_13_2">
            <rect
              x="1769"
              y="2116"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip127_13_2">
            <rect
              x="716"
              y="755"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip128_13_2">
            <rect
              x="716"
              y="804"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip129_13_2">
            <rect
              x="716"
              y="853"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip130_13_2">
            <rect
              x="716"
              y="904"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip131_13_2">
            <rect
              x="716"
              y="956"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip132_13_2">
            <rect
              x="716"
              y="1006"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip133_13_2">
            <rect
              x="816"
              y="1080"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip134_13_2">
            <rect
              x="1639"
              y="1446"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip135_13_2">
            <rect
              x="1745"
              y="1992"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip136_13_2">
            <rect
              x="1563"
              y="1884"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip137_13_2">
            <rect
              x="1359"
              y="1595"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip138_13_2">
            <rect
              x="1696"
              y="1568"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip139_13_2">
            <rect
              x="1769"
              y="1488"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip140_13_2">
            <rect
              x="1876"
              y="1386"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip141_13_2">
            <rect
              x="1940"
              y="1318"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip142_13_2">
            <rect
              x="2014"
              y="1248"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip143_13_2">
            <rect
              x="2153"
              y="1106"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip144_13_2">
            <rect
              x="2230"
              y="1025"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip145_13_2">
            <rect
              x="2306"
              y="955"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip146_13_2">
            <rect
              x="2429"
              y="931"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip147_13_2">
            <rect
              x="2557"
              y="931"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip148_13_2">
            <rect
              x="2816"
              y="991"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip149_13_2">
            <rect
              x="2816"
              y="1061"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip150_13_2">
            <rect
              x="2799"
              y="1248"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip151_13_2">
            <rect
              x="741"
              y="1454"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip152_13_2">
            <rect
              x="944"
              y="1519"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip153_13_2">
            <rect
              x="1002"
              y="1576"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip154_13_2">
            <rect
              x="1077"
              y="1645"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip155_13_2">
            <rect
              x="1148"
              y="1715"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip156_13_2">
            <rect
              x="1097"
              y="1963"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip157_13_2">
            <rect
              x="1021"
              y="1889"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip158_13_2">
            <rect
              x="955"
              y="1808"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip159_13_2">
            <rect
              x="911"
              y="1732"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip160_13_2">
            <rect
              x="878"
              y="1643"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip161_13_2">
            <rect
              x="857"
              y="1543"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip162_13_2">
            <rect
              x="872"
              y="1313"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip163_13_2">
            <rect
              x="907"
              y="1207"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip164_13_2">
            <rect
              x="1282"
              y="851"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip165_13_2">
            <rect
              x="1642"
              y="830"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip166_13_2">
            <rect
              x="1918"
              y="980"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip167_13_2">
            <rect
              x="2001"
              y="1065"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip168_13_2">
            <rect
              x="2132"
              y="1442"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip169_13_2">
            <rect
              x="2127"
              y="1540"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip170_13_2">
            <rect
              x="2105"
              y="1640"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip171_13_2">
            <rect
              x="2067"
              y="1732"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip172_13_2">
            <rect
              x="1806"
              y="1787"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip173_13_2">
            <rect
              x="1671"
              y="1645"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip174_13_2">
            <rect
              x="1370"
              y="1929"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip175_13_2">
            <rect
              x="1894"
              y="1543"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip176_13_2">
            <rect
              x="1965"
              y="1472"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip177_13_2">
            <rect
              x="2035"
              y="1407"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip178_13_2">
            <rect
              x="2214"
              y="1222"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip179_13_2">
            <rect
              x="2308"
              y="1129"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip180_13_2">
            <rect
              x="2460"
              y="1048"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip181_13_2">
            <rect
              x="2675"
              y="990"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip182_13_2">
            <rect
              x="2675"
              y="814"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
          <clipPath id="clip183_13_2">
            <rect
              x="2928"
              y="1158"
              width="53.5"
              height="24"
              rx="10"
              fill="white"
            />
          </clipPath>
        </defs>
      </svg>
      {stationIds.size > 0 && (
        <>
          <span className="font-bold text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.station_count"
              defaultMessage="{count, plural, one { {count} stations } other { {count} stations }}"
              values={{
                count: stationIds.size,
              }}
            />
          </span>
          <span className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedList
              value={Array.from(stationIds).map((stationId) => {
                return (
                  <Link
                    className="hover:underline"
                    key={stationId}
                    to={buildLocaleAwareLink(
                      `/stations/${stationId}`,
                      intl.locale,
                    )}
                  >
                    {stationTranslatedNames[stationId] ?? stationId}
                  </Link>
                );
              })}
            />
          </span>
        </>
      )}
    </div>
  );
};
