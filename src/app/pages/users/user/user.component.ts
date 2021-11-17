import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthorizationDefinitionFieldMetadata, DialogMode } from 'types/Authorization';

import { AuthorizationService } from '../../../services/authorization.service';
import { CentralServerService } from '../../../services/central-server.service';
import { ComponentService } from '../../../services/component.service';
import { DialogService } from '../../../services/dialog.service';
import { MessageService } from '../../../services/message.service';
import { SpinnerService } from '../../../services/spinner.service';
import { WindowService } from '../../../services/window.service';
import { AbstractTabComponent } from '../../../shared/component/abstract-tab/abstract-tab.component';
import { Address } from '../../../types/Address';
import { ActionResponse } from '../../../types/DataResult';
import { RestResponse } from '../../../types/GlobalType';
import { HTTPError } from '../../../types/HTTPError';
import { TenantComponents } from '../../../types/Tenant';
import { User, UserRole } from '../../../types/User';
import { Utils } from '../../../utils/Utils';
import { UserMainComponent } from './main/user-main.component';
import { UserNotificationsComponent } from './notifications/user-notifications.component';
import { PaymentMethodsTableDataSource } from './payment-methods/payment-methods-table-data-source';
import { UserSecurityComponent } from './security/user-security.component';
import { UserDialogComponent } from './user.dialog.component';

@Component({
  selector: 'app-user',
  templateUrl: 'user.component.html',
  providers: [PaymentMethodsTableDataSource],
})
export class UserComponent extends AbstractTabComponent implements OnInit {
  @Input() public currentUserID!: string;
  @Input() public metadata!: Record<string, AuthorizationDefinitionFieldMetadata>;
  @Input() public inDialog!: boolean;
  @Input() public dialogRef!: MatDialogRef<UserDialogComponent>;
  @Input() public dialogMode!: DialogMode;

  @ViewChild('userMainComponent') public userMainComponent!: UserMainComponent;
  @ViewChild('userNotificationsComponent') public userNotificationsComponent!: UserNotificationsComponent;
  @ViewChild('userSecurityComponent') public userSecurityComponent!: UserSecurityComponent;

  public isAdmin = false;
  public isSuperAdmin = false;
  public isBasic = false;
  public isSiteAdmin = false;

  public isBillingComponentActive: boolean;

  public user!: User;

  public formGroup!: FormGroup;

  public iNumber!: AbstractControl;
  public costCenter!: AbstractControl;

  public address!: Address;

  public canListPaymentMethods: boolean;

  public constructor(
    public paymentMethodsTableDataSource: PaymentMethodsTableDataSource,
    private authorizationService: AuthorizationService,
    private centralServerService: CentralServerService,
    private componentService: ComponentService,
    private messageService: MessageService,
    private spinnerService: SpinnerService,
    private dialogService: DialogService,
    private translateService: TranslateService,
    private router: Router,
    protected activatedRoute: ActivatedRoute,
    protected windowService: WindowService) {
    super(activatedRoute, windowService, ['common', 'notifications', 'address', 'password', 'connections', 'miscs', 'billing'], false);
    // Admin?
    this.isAdmin = this.authorizationService.isAdmin();
    this.isSuperAdmin = this.authorizationService.isSuperAdmin();
    this.isBasic = this.authorizationService.isBasic();
    this.isSiteAdmin = this.authorizationService.hasSitesAdminRights();
    if (this.isBasic || this.isSiteAdmin) {
      this.setHashArray(['common', 'address', 'password', 'connections', 'miscs']);
    }
    if (this.isSuperAdmin) {
      this.setHashArray(['common', 'notifications', 'address', 'password', 'miscs']);
    }
    this.isBillingComponentActive = this.componentService.isActive(TenantComponents.BILLING);
    this.canListPaymentMethods = this.authorizationService.canListPaymentMethods();
  }

  public updateRoute(event: number) {
    if (!this.inDialog) {
      super.updateRoute(event);
    }
  }

  public ngOnInit() {
    if (this.activatedRoute.snapshot.url[0]?.path === 'profile') {
      this.currentUserID = this.centralServerService.getLoggedUser().id;
    }
    // Init the form
    this.formGroup = new FormGroup({
      iNumber: new FormControl(''),
      costCenter: new FormControl('',
        Validators.compose([
          Validators.pattern('^[0-9]*$'),
        ])),
    });
    // Form
    this.iNumber = this.formGroup.controls['iNumber'];
    this.costCenter = this.formGroup.controls['costCenter'];
    // Load
    this.loadUser();
    if (!this.inDialog) {
      super.enableRoutingSynchronization();
    }
  }

  public refresh() {
    this.loadUser();
  }

  public loadUser() {
    if (this.currentUserID) {
      this.paymentMethodsTableDataSource.setCurrentUserId(this.currentUserID);
      this.spinnerService.show();
      // eslint-disable-next-line complexity
      this.centralServerService.getUser(this.currentUserID).subscribe((user) => {
        this.formGroup.markAsPristine();
        this.user = user;
        if (user.iNumber) {
          this.formGroup.controls.iNumber.setValue(user.iNumber);
        }
        if (user.costCenter) {
          this.formGroup.controls.costCenter.setValue(user.costCenter);
        }

        if (user.address) {
          this.address = user.address;
        }
      });
    }
  }

  public saveUser(user: User) {
    if (this.currentUserID) {
      this.updateUser(user);
    } else {
      this.createUser(user);
    }
  }

  public closeDialog(saved: boolean = false) {
    if (this.inDialog) {
      this.windowService.clearSearch();
      this.dialogRef.close(saved);
    }
  }

  public close() {
    Utils.checkAndSaveAndCloseDialog(this.formGroup, this.dialogService,
      this.translateService, this.saveUser.bind(this), this.closeDialog.bind(this));
  }

  public roleChanged(role: UserRole) {
    this.userNotificationsComponent?.roleChanged(role);
  }

  private createUser(user: User) {
    this.userMainComponent.updateUserImage(user);
    this.userSecurityComponent.updateUserPassword(user);
    this.spinnerService.show();
    this.centralServerService.createUser(user).subscribe((response: ActionResponse) => {
      this.spinnerService.hide();
      if (response.status === RestResponse.SUCCESS) {
        this.messageService.showSuccessMessage('users.create_success', { userFullName: user.firstName + ' ' + user.name });
        user.id = response.id ?? '';
        this.currentUserID = response.id ?? '';
        this.closeDialog(true);
      } else {
        Utils.handleError(JSON.stringify(response), this.messageService, 'users.create_error');
      }
    }, (error) => {
      this.spinnerService.hide();
      switch (error.status) {
        // Email already exists
        case HTTPError.USER_EMAIL_ALREADY_EXIST_ERROR:
          this.messageService.showErrorMessage('authentication.email_already_exists');
          break;
        // User deleted
        case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
          this.messageService.showErrorMessage('users.user_do_not_exist');
          break;
        // No longer exists!
        default:
          Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'users.create_error');
      }
    });
  }

  private updateUser(user: User) {
    this.userMainComponent.updateUserImage(user);
    this.userSecurityComponent.updateUserPassword(user);
    this.spinnerService.show();
    this.centralServerService.updateUser(user).subscribe((response) => {
      this.spinnerService.hide();
      if (response.status === RestResponse.SUCCESS) {
        this.messageService.showSuccessMessage('users.update_success', { userFullName: user.firstName + ' ' + user.name });
        this.closeDialog(true);
      } else {
        Utils.handleError(JSON.stringify(response), this.messageService, 'users.update_error');
      }
    }, (error) => {
      this.spinnerService.hide();
      switch (error.status) {
        // Email already exists
        case HTTPError.USER_EMAIL_ALREADY_EXIST_ERROR:
          this.messageService.showErrorMessage('authentication.email_already_exists');
          break;
        // User deleted
        case HTTPError.OBJECT_DOES_NOT_EXIST_ERROR:
          this.messageService.showErrorMessage('users.user_do_not_exist');
          break;
        // No longer exists!
        default:
          Utils.handleHttpError(error, this.router, this.messageService, this.centralServerService, 'users.update_error');
      }
    });
  }
}
