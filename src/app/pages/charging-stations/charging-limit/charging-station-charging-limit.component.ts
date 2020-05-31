import { Component, Input, OnInit } from '@angular/core';

import { CentralServerNotificationService } from 'app/services/central-server-notification.service';
import { CentralServerService } from 'app/services/central-server.service';
import { ChargingStation } from 'app/types/ChargingStation';
import { ConfigService } from 'app/services/config.service';
import { HTTPError } from 'app/types/HTTPError';
import { MatDialogRef } from '@angular/material/dialog';
import { MessageService } from 'app/services/message.service';
import { Router } from '@angular/router';
import { SpinnerService } from 'app/services/spinner.service';
import { Utils } from 'app/utils/Utils';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-charging-station-charging-limit',
  templateUrl: 'charging-station-charging-limit.component.html',
})
export class ChargingStationChargingLimitComponent implements OnInit {
  @Input() public chargingStationID!: string;
  @Input() public inDialog!: boolean;
  @Input() public dialogRef!: MatDialogRef<any>;
  public chargingStation: ChargingStation;

  constructor(
    private spinnerService: SpinnerService,
    private centralServerService: CentralServerService,
    private centralServerNotificationService: CentralServerNotificationService,
    private configService: ConfigService,
    private messageService: MessageService,
    private router: Router) {
    if (this.configService.getCentralSystemServer().socketIOEnabled) {
      // Update Charging Station?
      this.centralServerNotificationService.getSubjectChargingStation().pipe(debounceTime(
        this.configService.getAdvanced().debounceTimeNotifMillis)).subscribe((singleChangeNotification) => {
        if (this.chargingStation && singleChangeNotification && singleChangeNotification.data &&
            singleChangeNotification.data.id === this.chargingStation.id) {
          // Reload
          this.loadChargingStation();
        }
      });
      // Update Charging Station?
      this.centralServerNotificationService.getSubjectSiteArea().pipe(debounceTime(
        this.configService.getAdvanced().debounceTimeNotifMillis)).subscribe((singleChangeNotification) => {
        if (this.chargingStation && singleChangeNotification && singleChangeNotification.data &&
            singleChangeNotification.data.id === this.chargingStation.siteAreaID) {
          // Reload
          this.loadChargingStation();
        }
      });
    }
  }

  public ngOnInit() {
    // Load
    this.loadChargingStation();
  }

  public close(saved: boolean = false) {
    if (this.inDialog) {
      this.dialogRef.close(saved);
    }
  }

  public loadChargingStation() {
    if (this.chargingStationID) {
      this.spinnerService.show();
      this.centralServerService.getChargingStation(this.chargingStationID).subscribe((chargingStation) => {
        this.spinnerService.hide();
        this.chargingStation = chargingStation;
      }, (error) => {
        this.spinnerService.hide();
        switch (error.status) {
          case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
            this.messageService.showErrorMessage('chargers.charger_not_found');
            break;
          default:
            Utils.handleHttpError(error, this.router, this.messageService,
              this.centralServerService, 'chargers.charger_not_found');
        }
      });
    }
  }
}
