import { computed, Computed, Disposable, Observable, observable } from 'grainjs';
import { Document, UserAPI } from 'app/common/UserAPI';
import _ from 'lodash';
import { HomeModel } from './HomeModel';

export interface AttachDocumentManagerModel {
  document: Document;
  availableDocuments: Document[];
  attachments: Observable<Record<string, boolean>>;
  isAnythingChanged: Computed<boolean>;

  save: ( userAPI: UserAPI ) => Promise<void>;
}

export class AttachDocumentManagerModelImpl extends Disposable implements AttachDocumentManagerModel {
  public document: Document;
  public availableDocuments: Document[];

  public attachments = observable<Record<string, boolean>>({});

  public readonly isAnythingChanged: Computed<boolean> = this.autoDispose(computed<boolean>((use) => {
    const attachments = use(this.attachments);
    const attached = new Set( Object.keys( attachments ).filter( k => attachments[k] ) );
    const docAttachments = new Set( this.document?.options?.attachedDocuments || [] );
    return !_.isEqual( attached, docAttachments );
  }));

  constructor(
    home: HomeModel,
    document: Document,
  ) {
    super();

    this.document = document;
    this.availableDocuments = home.currentWSDocs.get().filter( doc => doc.id !== document.id );

    this.attachments.addListener( ( val ) => {
      console.log( `Attachments changed: ${ JSON.stringify( val ) }` );
    });

    this.attachments.set( this.availableDocuments.reduce( ( memo, doc ) => {
      memo[doc.id] = (this.document?.options?.attachedDocuments || []).includes( doc.id )
      return memo;
    }, {} as Record<string, boolean> ));
  }

  public save( userAPI: UserAPI ): Promise<void> {
    console.log( `Saving: ${ JSON.stringify( this.attachments.get() ) }` );

    return userAPI.updateDoc( this.document.id, {
      options: {
        ...(this.document.options || {}),
        attachedDocuments: Object.keys( this.attachments.get() ).filter( k => this.attachments.get()[k] ),
      }
    });
  }

}
