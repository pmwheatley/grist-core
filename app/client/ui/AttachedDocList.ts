import { makeT } from "app/client/lib/localization";
import { getTimeFromNow } from "app/client/lib/timeUtils";
import { urlState } from "app/client/models/gristUrlState";
import { HomeModel, ViewSettings } from "app/client/models/HomeModel";
import { workspaceName } from "app/client/models/WorkspaceInfo";
import { buildDocIcon, stripIconFromName } from "app/client/ui/DocIcon";
import { STICKY_HEADER_HEIGHT_PX } from "app/client/ui/DocMenuCss";
import { buildTabs, TabProps } from 'app/client/ui2018/tabs';
import {
  isNarrowScreenObs,
  mediaMedium,
  theme,
  vars,
} from "app/client/ui2018/cssVars";
import { IconName } from "app/client/ui2018/IconList";
import { icon as cssIcon } from "app/client/ui2018/icons";
import { stretchedLink } from "app/client/ui2018/stretchedLink";
import { visuallyHidden } from "app/client/ui2018/visuallyHidden";
import { select } from "app/client/ui2018/menus";
import { HomePageTab } from "app/common/gristUrls";
import { SortPref } from "app/common/Prefs";
import * as roles from "app/common/roles";
import { Document } from "app/common/UserAPI";
import {
  Computed,
  computedArray,
  Disposable,
  dom,
  makeTestId,
  MaybeObsArray,
  Observable,
  styled,
} from "grainjs";
import sortBy from "lodash/sortBy";
import { squareCheckbox } from '../ui2018/checkbox';
import { unstyledH2, unstyledUl } from '../ui2018/unstyled';

const t = makeT("AttachedDocList");

const testId = makeTestId("test-dm-");

interface AttachedDocListOptions {
  document: Document;
  home: HomeModel;
  attachedDocs: Record<string, Observable<boolean> >,
  viewSettings?: ViewSettings;
}

export class AttachedDocList extends Disposable {
  private readonly _home = this._options.home;
  private readonly _attachedDocs = this._options.attachedDocs;
  private readonly _tabNames: Computed<HomePageTab[]> = Computed.create(
    this,
    this._home.currentPage,
    (_use, page) => {
      if (page === "all") {
        return ["recent", "pinned", "all"];
      } else {
        return ["all", "pinned"];
      }
    }
  );
  private readonly _tabIconsAndLabels = getTabIconsAndLabels();

  private readonly _tabs: MaybeObsArray<TabProps> = this.autoDispose(
    computedArray(this._tabNames, (tab) => ({
      id: tab,
      label: this._tabIconsAndLabels[tab].label,
      icon: this._tabIconsAndLabels[tab].icon,
      link: { homePageTab: tab },
    })
  ));
  private readonly _viewSettings =
    this._options.viewSettings ?? this._options.home;
  private readonly _tab = Computed.create(
    this,
    this._tabNames,
    urlState().state,
    (_use, tabs, { homePageTab }) => {
      return homePageTab && tabs.includes(homePageTab) ? homePageTab : tabs[0];
    }
  );
  private readonly _showWorkspace = Computed.create(
    this,
    this._home.currentPage,
    (_use, page) => {
      return page !== "workspace";
    }
  );

  constructor(private _options: AttachedDocListOptions) {
    super();
  }

  public buildDom() {
    return dom("div", this._buildHeader(), this._buildBody());
  }

  private _buildHeader() {
    return cssHeader(
      visuallyHidden(unstyledH2(t("Documents list"))),
      buildTabs(this._tabs, this._tab),
      this._buildViewSettings()
    );
  }

  private _buildViewSettings() {
    return dom.maybe(
      (use) => use(this._tab) !== "recent",
      () =>
        cssViewSettings(
          dom.update(
            select<SortPref>(
              this._viewSettings.currentSort,
              [
                { value: "name", label: t("Sort by name") },
                { value: "date", label: t("Sort by date") },
              ],
              { buttonCssClass: cssSortSelect.className }
            ),
            testId("sort-mode")
          )
        )
    );
  }

  private _buildBody() {
    const { currentSort } = this._viewSettings;
    return [
      dom.domComputed(
        (use) => ({
          docs: use(this._home.currentWSDocs)
            .filter( doc => doc.id !== this._options.document.id),
          sort: use(currentSort),
          tab: use(this._tab),
        }),
        ({ docs, sort, tab }) => {
          docs = sortAndFilterDocs(docs, { sort, tab });
          if (docs.length === 0) {
            return cssNoDocsMessage(
              cssNoDocsImage({ alt: '', width: '150', height: '140', src: "img/create-document.svg" }),
              dom("div", cssParagraph(t("No documents to show."))),
              testId("no-docs-message")
            );
          }

          return [
            // the aria-hidden attributes are there to prevent screen reader annoucements,
            // as they are not relevant in that case
            cssDocHeaderRow(
              dom.hide(isNarrowScreenObs()),
              cssNameColumn(t("Name"), {'aria-hidden': 'true'}),
              cssWorkspaceColumn(t("Workspace"), dom.show(this._showWorkspace), {'aria-hidden': 'true'}),
              cssEditedAtColumn(t("Last edited"), {'aria-hidden': 'true'}),
              cssOptionsColumn()
            ),
            unstyledUl(
              dom.forEach(docs, (doc) => {
                return cssDocRow(
                  dom.on("click", (ev) => this._attachedDocs[doc.id].set( !this._attachedDocs[doc.id].get() )),
                  cssDoc(
                    cssDoc.cls("-no-access", !roles.canView(doc.access)),
                    cssDocIconAndName(
                      buildDocIcon(
                        {
                          docId: doc.id,
                          docName: doc.name,
                          icon: doc.options?.appearance?.icon,
                        },
                        testId("doc-icon"),
                        {'aria-hidden': 'true'},
                      ),
                      cssDocNameAndBadges(
                        cssDocName(
                          stripIconFromName(doc.name, Boolean(doc.options?.appearance?.icon?.emoji)),
                          testId("doc-name")
                        ),
                        cssDocBadges(
                          !doc.isPinned
                            ? null
                            : cssPinIcon("Pin2", testId("doc-pinned")),
                          !doc.public
                            ? null
                            : cssWorldIcon("World", testId("doc-public"))
                        )
                      )
                    ),
                    cssDocWorkspace(
                      dom.show(this._showWorkspace),
                      dom('span',
                        visuallyHidden(t("Workspace")),
                        workspaceName(this._home.app, doc.workspace)
                      ),
                      testId("doc-workspace")
                    ),
                    cssDocEditedAt(
                      t("Edited {{at}}", { at: getTimeFromNow(doc.updatedAt) }),
                      testId("doc-edited-at")
                    ),
                    cssDocDetailsCompact(
                      cssDocName(
                        stripIconFromName(doc.name, Boolean(doc.options?.appearance?.icon?.emoji))
                      ),
                      cssDocEditedAt(
                        t("Edited {{at}}", {
                          at: getTimeFromNow(doc.updatedAt),
                        })
                      ),
                      cssDocBadges(
                        !doc.isPinned
                          ? null
                          : cssPinIcon("Pin2"),
                        !doc.public
                          ? null
                          : cssWorldIcon("World")
                      )
                    ),
                    squareCheckbox( this._attachedDocs[ doc.id ] ),
                    testId("doc")
                  )
                );
              }),
            ),
          ];
        }
      ),
    ];
  }
}

interface IconAndLabel {
  icon: IconName;
  label: string;
}

function getTabIconsAndLabels(): Record<HomePageTab, IconAndLabel> {
  return {
    recent: {
      icon: "Clock",
      label: t("Recent"),
    },
    pinned: {
      icon: "Pin2",
      label: t("Pinned"),
    },
    all: {
      icon: "Layers",
      label: t("All"),
    },
  };
}

interface SortAndFilterOptions {
  sort: SortPref;
  tab: HomePageTab;
}

function sortAndFilterDocs(
  docs: Document[],
  { sort, tab }: SortAndFilterOptions
) {
  if (tab === "pinned") {
    docs = docs.filter(({ isPinned }) => isPinned);
  }
  if (sort === "date" || tab === "recent") {
    docs = sortBy(docs, (doc) => doc.removedAt || doc.updatedAt).reverse();
  } else {
    docs = sortBy(docs, (doc) => doc.name.toLowerCase());
  }
  return docs;
}

export async function renameDoc(home: HomeModel, doc: Document, val: string) {
  if (val !== doc.name) {
    try {
      await home.renameDoc(doc.id, val);
    } catch (err) {
      reportError(err as Error);
    }
  }
}

const cssHeader = styled("div", `
  // position: sticky;
  top: ${STICKY_HEADER_HEIGHT_PX}px;
  background-color: ${theme.mainPanelBg};
  z-index: ${vars.stickyHeaderZIndex};
  display: flex;
  column-gap: 24px;
  margin-bottom: 8px;
`);

const cssViewSettings = styled("div", `
  display: flex;
  align-items: flex-end;
  min-width: 0;
`);

const cssSortSelect = styled("div", `
  border: none;
  display: inline-flex;
  column-gap: 6px;
  height: unset;
  line-height: unset;
  align-items: center;
  color: ${theme.controlFg};
  --icon-color: ${theme.controlFg};
  background-color: unset;
  font-size: 14px;
  font-weight: 500;
  padding: 0;

  &:hover, &:focus, &.weasel-popup-open {
    color: ${theme.controlHoverFg};
    --icon-color: ${theme.controlHoverFg};
    outline: none;
    box-shadow: none;
  }
`);

const cssParagraph = styled("div", `
  color: ${theme.text};
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  margin-bottom: 12px;
  text-align: center;
`);

const cssNoDocsMessage = styled("div", `
  margin-top: 70px;
  display: flex;
  flex-direction: column;
  row-gap: 16px;
  align-items: center;
  justify-content: center;
`);

const cssNoDocsImage = styled("img", `
  display: flex;
  align-items: center;
  justify-content: center;
`);

const cssDocHeaderRow = styled("div", `
  display: flex;
  padding: 0px 8px;
  color: ${theme.lightText};

  @media ${mediaMedium} {
    & {
      display: none;
    }
  }
`);

const cssNameColumn = styled("div", `
  flex: 1 0 50%;
`);

const cssWorkspaceColumn = styled("div", `
  flex: 1 1 20%;
  margin-right: 40px;
  max-width: 200px;
`);

const cssEditedAtColumn = styled("div", `
  flex: 1 1 30%;
  margin-right: 16px;
  max-width: 250px;
`);

const cssOptionsColumn = styled("div", `
  flex: none;
  width: 44px;
  margin: 0 4px 0 auto;
  padding: 4px;
  display: flex;
`);

const cssDocRow = styled("li", `
  position: relative;
  border-radius: 3px;
  font-size: 14px;
  color: ${theme.text};
  --icon-color: ${theme.lightText};

  &:hover, &.weasel-popup-open {
    background-color: ${theme.lightHover};
  }
`);

const cssDoc = styled("div", `
  display: flex;
  position: relative;
  align-items: center;
  border-radius: 3px;
  outline: none;
  padding: 8px;

  &-no-access, &-no-access:hover, &-no-access:focus {
    color: ${theme.disabledText};
    cursor: not-allowed;
  }

  @media ${mediaMedium} {
    & {
      align-items: initial;
      column-gap: 16px;
    }
  }
`);

const cssDocDetailsCompact = styled("div", `
  display: none;
  flex: 1 1 auto;
  flex-direction: column;
  row-gap: 8px;
  column-gap: 40px;
  min-width: 0px;
  align-items: flex-start;

  @media ${mediaMedium} {
    & {
      display: flex;
    }
  }
`);

const cssDocIconAndName = styled(cssNameColumn, `
  display: flex;
  align-items: center;
  column-gap: 11px;
  overflow: hidden;

  @media ${mediaMedium} {
    & {
      align-items: initial;
      flex: none;
    }
  }
`);

const cssDocNameAndBadges = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-right: 35px;
  overflow: hidden;

  @media ${mediaMedium} {
    & {
      display: none;
    }
  }
`);

const noAccessStyles = `
  .${cssDoc.className}-no-access &,
  .${cssDoc.className}-no-access:hover &,
  .${cssDoc.className}-no-access:focus & {
    color: ${theme.disabledText};
  }
`;

const cssDocName = styled(stretchedLink, `
  font-size: 14px;
  flex: 0 1 auto;
  padding: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${theme.text};
  font-weight: 600;

  &, &:hover, &:focus {
    text-decoration: none;
    outline: none;
    color: inherit;
  }

  &:focus-visible {
    outline-offset: -3px;
  }

  ${noAccessStyles}

  .${cssDocDetailsCompact.className} & {
    padding: 0;
  }

  .${cssDocDetailsCompact.className} &:focus-visible {
    outline-offset: 3px;
  }

  @media ${mediaMedium} {
    & {
      width: 100%;
    }
  }
`);

const cssDocBadges = styled("div", `
  display: flex;
  align-items: center;
  flex-shrink: 0;
  column-gap: 8px;
  margin-left: auto;
  min-height: 16px;

  @media ${mediaMedium} {
    & {
      margin-left: initial;
    }
  }
`);

const cssPinIcon = styled(cssIcon, `
  flex: none;
  --icon-color: ${theme.lightText};
`);

const cssWorldIcon = styled(cssIcon, `
  width: 24px;
  height: 24px;
  flex: none;
  --icon-color: ${theme.accentIcon};
`);

const secondaryColumnStyles = `
  color: ${theme.mediumText};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: normal;
  ${noAccessStyles}

  @media ${mediaMedium} {
    .${cssDoc.className} > & {
      display: none;
    }
  }
`;

const cssDocWorkspace = styled(cssWorkspaceColumn, secondaryColumnStyles);

const cssDocEditedAt = styled(cssEditedAtColumn, `
  ${secondaryColumnStyles};

  @media ${mediaMedium} {
    & {
      width: 100%;
    }
  }
`);
