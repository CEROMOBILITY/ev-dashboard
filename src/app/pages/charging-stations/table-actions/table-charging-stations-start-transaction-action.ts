import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthorizationService } from 'app/services/authorization.service';
import { CentralServerService } from 'app/services/central-server.service';
import { DialogService } from 'app/services/dialog.service';
import { MessageService } from 'app/services/message.service';
import { SpinnerService } from 'app/services/spinner.service';
import { TableAction } from 'app/shared/table/actions/table-action';
import { ChargePointStatus, ChargingStation, ChargingStationButtonAction, Connector, OCPPGeneralResponse } from 'app/types/ChargingStation';
import { ActionResponse } from 'app/types/DataResult';
import { ButtonColor, ButtonType, TableActionDef } from 'app/types/Table';
import { StartTransaction } from 'app/types/Transaction';
import { Utils } from 'app/utils/Utils';
import { Observable } from 'rxjs';

import { ChargingStationsStartTransactionDetailsDialogComponent } from '../details-component/charging-stations-start-transaction-details-dialog-component';

export interface TableChargingStationsStartTransactionActionDef extends TableActionDef {
  action: (chargingStation: ChargingStation, connector: Connector, authorizationService: AuthorizationService,
    dialogService: DialogService, dialog: MatDialog, translateService: TranslateService, messageService: MessageService,
    centralServerService: CentralServerService, spinnerService: SpinnerService, router: Router,
    refresh?: () => Observable<void>) => void;
}

export class TableChargingStationsStartTransactionAction implements TableAction {
  private action: TableChargingStationsStartTransactionActionDef = {
    id: ChargingStationButtonAction.START_TRANSACTION,
    type: 'button',
    icon: 'play_arrow',
    color: ButtonColor.ACCENT,
    name: 'general.start',
    tooltip: 'general.tooltips.start',
    action: this.startTransaction.bind(this),
  };

  public getActionDef(): TableChargingStationsStartTransactionActionDef {
    return this.action;
  }

  private startTransaction(chargingStation: ChargingStation, connector: Connector, authorizationService: AuthorizationService,
    dialogService: DialogService, dialog: MatDialog, translateService: TranslateService, messageService: MessageService,
    centralServerService: CentralServerService, spinnerService: SpinnerService, router: Router,
    refresh?: () => Observable<void>) {
    if (chargingStation.inactive) {
      dialogService.createAndShowOkDialog(
        translateService.instant('chargers.action_error.transaction_start_title'),
        translateService.instant('chargers.action_error.transaction_start_chargingStation_inactive'));
      return;
    }
    if (connector.status === ChargePointStatus.UNAVAILABLE) {
      dialogService.createAndShowOkDialog(
        translateService.instant('chargers.action_error.transaction_start_title'),
        translateService.instant('chargers.action_error.transaction_start_not_available'));
      return;
    }
    if (connector.currentTransactionID) {
      dialogService.createAndShowOkDialog(
        translateService.instant('chargers.action_error.transaction_start_title'),
        translateService.instant('chargers.action_error.transaction_in_progress'));
      return;
    }
    // Create dialog data
    const dialogConfig = new MatDialogConfig();
    dialogConfig.minWidth = '40vw';
    dialogConfig.panelClass = '';
    // Set data
    dialogConfig.data = {
      title: translateService.instant('chargers.start_transaction_details_title', {
        chargeBoxID: chargingStation.id
      }),
      chargeBoxID: chargingStation.id
    };
    // Show
    const dialogRef = dialog.open(ChargingStationsStartTransactionDetailsDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((startTransaction: StartTransaction) => {
      if (startTransaction) {
        this.startTransactionForUser(chargingStation, connector, startTransaction.userFullName, startTransaction.tagID,
          startTransaction.carID, dialogService, translateService, messageService, centralServerService, router, spinnerService, refresh);
      }
    });
  }

  private startTransactionForUser(chargingStation: ChargingStation, connector: Connector, userFullName: string, tagID: string,
    carID: string | null, dialogService: DialogService, translateService: TranslateService, messageService: MessageService,
    centralServerService: CentralServerService, router: Router, spinnerService: SpinnerService, refresh?: () => Observable<void>): void {
    dialogService.createAndShowYesNoDialog(
      translateService.instant('chargers.start_transaction_title'),
      translateService.instant('chargers.start_transaction_confirm', {
        chargeBoxID: chargingStation.id,
        userName: userFullName,
      }),
    ).subscribe((response) => {
      if (response === ButtonType.YES) {
        // Check badge
        if (!tagID) {
          messageService.showErrorMessage(
            translateService.instant('chargers.start_transaction_missing_active_tag', {
              chargeBoxID: chargingStation.id,
              userName: userFullName,
            }));
          return;
        }
        spinnerService.show();
        centralServerService.chargingStationStartTransaction(
          chargingStation.id, connector.connectorId, tagID, carID).subscribe((startTransactionResponse: ActionResponse) => {
            spinnerService.hide();
            if (startTransactionResponse.status === OCPPGeneralResponse.ACCEPTED) {
              messageService.showSuccessMessage(
                translateService.instant('chargers.start_transaction_success', { chargeBoxID: chargingStation.id }));
              if (refresh) {
                refresh().subscribe();
              }
            } else {
              Utils.handleError(JSON.stringify(response),
                messageService, translateService.instant('chargers.start_transaction_error'));
            }
          }, (error) => {
            spinnerService.hide();
            Utils.handleHttpError(error, router, messageService, centralServerService, 'chargers.start_transaction_error');
          });
      }
    });
  }
}
