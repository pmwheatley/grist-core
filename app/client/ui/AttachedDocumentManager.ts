import { UserAPI } from '../../common/UserAPI';
import { reportError } from '../models/errors';
import { Disposable, dom, observable, Observable, styled } from 'grainjs';
import {
  cssModalBody,
  cssModalButtons,
  cssModalTitle,
  IModalControl,
  modal
} from '../ui2018/modals';
import { mediaXSmall, testId, theme, vars } from '../ui2018/cssVars';
import { AttachDocumentManagerModel, AttachDocumentManagerModelImpl } from '../models/AttachDocumentManagerModel';
import { shadowScroll } from './shadowScroll';
import { Document } from "app/common/UserAPI";
import { isLongerThan } from '../../common/gutil';
import { bigBasicButton, bigPrimaryButton } from '../ui2018/buttons';
import { t } from '../lib/localization';
// import { squareCheckbox } from '../ui2018/checkbox';
import { AttachedDocList } from './AttachedDocList';
import { HomeModel } from '../models/HomeModel';

export interface IAttachedDocumentManagerOptions {
  home: HomeModel,
  document: Document
}

async function getModel(options: IAttachedDocumentManagerOptions): Promise<AttachDocumentManagerModelImpl> {
  return new AttachDocumentManagerModelImpl(
    options.home,
    options.document
  );
}

export function showAttachDocumentsModal(userApi: UserAPI, options: IAttachedDocumentManagerOptions) {
  const modelObs: Observable<AttachDocumentManagerModel|null> = observable(null);

  async function onConfirm(ctl: IModalControl) {
    const model = modelObs.get();
    if (!model) {
      ctl.close();
      return;
    }
    const tryToSaveChanges = async () => {
      // Save changes to the server, reporting any errors to the app.
      try {
        await model.save( userApi );

        ctl.close();

        window.location.reload();
      } catch (err) {
        reportError(err);
      }
    };

    tryToSaveChanges().catch(reportError);
  }

  const waitPromise = getModel(options)
    .then(model => modelObs.set(model))
    .catch(reportError);

  isLongerThan(waitPromise, 400).then((slow) => slow && modelObs.set(null)).catch(() => {});

  return buildAttachDocumentsManagerModal(modelObs, onConfirm, options);
}

function buildAttachDocumentsManagerModal(
  modelObs: Observable<AttachDocumentManagerModel|null>,
  onConfirm: (ctl: IModalControl) => Promise<void>,
  options: IAttachedDocumentManagerOptions
) {
  return modal(ctl => [
    // We set the padding to 0 since the body scroll shadows extend to the edge of the modal.
    { style: 'padding: 0;' },
    dom.domComputed(modelObs, model => {
      if (!model) { return null; }

      const cssBody = cssUserManagerBody;
      return [
        cssTitle(
          "Attach Documents",
          null,
          testId('um-header'),
        ),
        cssModalBody(
          cssBody(
            new AttachDocumentManager(
              model,
              options
            ).buildDom()
          ),
        ),
        cssModalButtons(
          { style: 'margin: 32px 64px; display: flex;' },
          bigPrimaryButton(
            t('Confirm'),
            dom.boolAttr('disabled', (use) => !use(model.isAnythingChanged)),
            dom.on('click', () => onConfirm(ctl)),
            testId('um-confirm')
          ),
          bigBasicButton(
            t('Close'),
            dom.on('click', () => ctl.close()),
            testId('um-cancel')
          ),
        )
      ];
    })
  ]);
}

export class AttachDocumentManager extends Disposable {
  // private _dom: HTMLDivElement;
  private _attachedDocs : Record<string, Observable<boolean> >;

  constructor(
    private _model: AttachDocumentManagerModel,
    private _options: {
      home: HomeModel,
      document: Document
    }
  ) {
    super();

    const availableDocuments = this._options.home.currentWSDocs.get().filter( doc => doc.id !== _options.document.id );

    this._attachedDocs = availableDocuments.reduce( ( memo, doc ) => {
      memo[doc.id] = Observable<boolean>.create(this,
        (this._model.document.options?.attachedDocuments || []).includes( doc.id) );
      return memo;
    }, {} as Record<string, Observable<boolean>>);

    Object.keys( this._attachedDocs ).forEach( docId => {
      this._attachedDocs[ docId ].addListener( ( val ) => {
        const attachments = this._model.attachments.get();
        this._model.attachments.set( {
          ...attachments,
          [ docId ]: val
        });
      });
    });

    this._options.home.currentWSDocs = observable( availableDocuments );
  }

  public buildDom() {
    return [
      shadowScroll(
        dom.create(AttachedDocList, {
          home: this._options.home,
          document: this._options.document,
          attachedDocs: this._attachedDocs
        }),
        // dom('table',
        //   dom( 'thead', dom( 'tr', dom( 'th', 'Name' ), dom( 'th', 'ID' ) ) ),
        //   dom( 'tbody',
        //     ...this._options.availableDocuments
        //       .filter( doc => doc.id !== this._options.document.id )
        //       .map( doc => dom('tr',
        //         dom( 'td', doc.name ),
        //         dom( 'td', doc.id ),
        //         dom( 'td', squareCheckbox( this._attachedDocs[ doc.id ] ) )
        //       )
        //     )
        //   )
        // )
      ),
    ];
  }
}

const cssAccessDetailsBody = styled('div', `
  display: flex;
  flex-direction: column;
  width: 600px;
  font-size: ${vars.mediumFontSize};
`);

const cssUserManagerBody = styled(cssAccessDetailsBody, `
  height: 374px;
  border-bottom: 1px solid ${theme.modalBorderDark};
`);

const cssTitle = styled(cssModalTitle, `
  margin: 40px 64px 0 64px;

  @media ${mediaXSmall} {
    & {
      margin: 16px;
    }
  }
`);

