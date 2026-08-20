<?php
require __DIR__ . '/vendor/autoload.php';
use phpseclib3\Net\SFTP;
use phpseclib3\Net\SSH2;
use phpseclib3\Crypt\PublicKeyLoader; 
//============= Get data ========================//
 function getDO($date){
            //global $db;
            $aDOdata = array();
            //$DB_WMS = new DB('BITINTRA');
            $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            if($date == '' )
            {
                return $aDOdata;
            }
              $sql = "SELECT s.do,p.ship_to_location FROM WMS.HIT_SHIP_CONFIRM s 
                    INNER JOIN WMS.lrv_wms_check_confirm_log l on s.plan_id = l.plan_id
                    INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
                    WHERE DATE(s.date) =  '".$date."' AND s.type = 'PACK'
                    AND s.do NOT IN (SELECT do_no FROM WMS.HIT_TRANSFER_DATA_LOG_FTP) 
                    ORDER BY s.do ";   
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            
            { 
                return array();
            }
            while($rs = $DB_WMS->getData($query))
            {
                $aDOdata[$rs['do']] = $rs;
            }
            return $aDOdata;
    }
    
    function getProdWMS($DO_lot){
            //global $db;
            $aWMSdata = array();
            //$DB_WMS = new DB('BITINTRA');
            $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            if($DO_lot == '' )
            {
                return $aWMSdata;
            }
            $sql = " 
            SELECT d.plan_id,d.do_no,p.customer_pn,p.item_no,p.model_name ,p.qty,b.store_lot,b.prod_lot,b.qty as qty_boxs,p.po_no
            FROM (WMS.SHIPMENTDO_DATA d INNER JOIN WMS.SHIPMENTPLAN_DATA p on d.plan_id = p.plan_id ) 
            INNER JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b on d.plan_id = b.plan_id
            WHERE d.do_no IN  
            (".$DO_lot.")
            ORDER BY d.do_no ";
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data WMS )","team"
                ); 
                exit(); 
                
            }
            while($rs = $DB_WMS->getData($query))
            {
                $aWMSdata[$rs['do_no']][$rs['store_lot']][$rs['prod_lot']] = $rs;
            }

            return $aWMSdata;
    }

    function get_prefix_type(){
            //global $db;
            $aRS = array();
            //$DB_WMS = new DB('BITINTRA');
            $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            ;
            $sql = " 
             SELECT prefix,ship_to,type 
             FROM WMS.HIT_SHIP_TO_MASTER 
             WHERE status ='active'
             "; 
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data Prefix )","team"
                );  
                exit();
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS[$rs['prefix']] = $rs;
            }

            return $aRS;
    }
    function get_config(){
            //global $db;
            $aRS = "";
            //$DB_WMS = new DB('BITINTRA');
            $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            ;
            $sql = " SELECT * FROM WMS.HIT_FTP_CONFIG "; 
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Get config error )","team"
                );  
                exit(); 
 
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS = $rs['host'].",".$rs['user'].",".$rs['password'].",".$rs['local_directory_path'].",".$rs['remote_path'];
            }

            return $aRS;
    }
    
    function get_send_mail(){
            //global $db;
            $aRS = array();
            $DB_WMS = new DB('BITINTRA');
            //$DB_WMS = new DB('BITINTRADEV4');
            $DB_WMS->errorShow = true;
            ;
            $sql = " SELECT mail_send_to,mail_user FROM WMS.HIT_MAIL_ALERT "; 
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            { 
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data mail alert )","team"
                );  
                exit();
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS[$rs['mail_send_to']] = $rs;
            }

            return $aRS;
    }

    function getShip_confirm_data($Prod_lot){
            //global $db;
            $aRS = array();
            if($Prod_lot == '' )
            {
                return $aRS;
            }
           //$DB_WMS = new DB('BITINTRA');
           $DB_WMS = new DB('BITINTRA_REAL');
           $DB_WMS->errorShow = true;
           ;
           $sql = " 
           SELECT s.pallet_no as pallet_running ,s.box_detail,DATE_FORMAT(s.date,'%d-%M-%Y') as ship_date ,d.qty_pallet,s.prod_lot,s.box_ship_name
           FROM WMS.HIT_SHIP_CONFIRM AS s
           INNER JOIN WMS.HIT_PALLET_DATA d
           ON s.pallet_no= d.running_pallet
           WHERE s.prod_lot IN
           (
           ".$Prod_lot."
           )
           AND s.type ='pack' AND d.status ='Active'
           ";
           $query = $DB_WMS->getQuery($sql);
           if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data Shipment )","team"
                );  
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS[$rs['prod_lot']] = $rs;
            }

            return $aRS;
    }

    function getPack($Prod_lot){
            //global $db;
            $aRS = array();
            if($Prod_lot == '')
            {
                return $aRS;
            }
            $DBHGST = new DB('HITACHI02');
            //$DBHGST = new DB('BITINTRADEV4');
            $DBHGST->errorShow = true
            ;
            $sql = " 
             SELECT p.*,h.pack_size 
             FROM HITACHI.PROD_DATA p
             INNER JOIN HITACHI.PACK_HEADER h  ON p.pack_id = h.pack_id  
             WHERE p.prod_lot IN
            (
            ".$Prod_lot."
            )
             ";
            //echo '<BR>';
            $query = $DBHGST->getQuery($sql);
            if($DBHGST->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data pack hitachi )","team"
                );  
                exit(); 
                
            }
            while($rs = $DBHGST->getData($query))
            {
               $aRS[$rs['prod_lot']][$rs['pack_id']] = $rs;
            }
            //$total = 1;
            return $aRS;
    }
    
    function get_model_name($bit_pn){
            //global $db;
            $aRS = "";
            if($bit_pn == '')
            {
                return $aRS;
            }
           //$DB_WMS = new DB('BITINTRA');
           $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true
            ;
            $sql = "SELECT model_name 
            FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG 
            WHERE item_no = '".$bit_pn."' 
             "; 
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found model name [MASTER] )","team"
                );  
                exit(); 
                
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS = $rs['model_name'];
            }
            //$total = 1;
            return $aRS;
    }
 
    //============= End Get data ========================//
    
    //============= function ========================//
    function  prepareDO($aDOdata){
        $RS = '';
        foreach($aDOdata as $keyDO => $dtDO){
            $RS .= ($RS == '' ? "'".$keyDO."'" : ",'".$keyDO."'");
        }
        return $RS;
    }
    
    function  prepareProd_lot($aWMSdata){
        $RS = '';
        foreach($aWMSdata as $key => $dtDO){
            foreach($dtDO as $keySt_lot => $dtSt_lot){
                foreach($dtSt_lot as $keyProd_lot => $dtProd_lot){
                    $RS .= ($RS == '' ? "'".$keyProd_lot."'" : ",'".$keyProd_lot."'");
                }
            }   
        }
        return $RS;
    }
    //============= End function ========================// 
    
    
   //============= send file ========================//   
   function gen_data_and_send_file($do_list,$type,$aPrefix_type,$ship_to_location){
            
            $aWMSdata = getProdWMS($do_list);
            $prod_lot_list = prepareProd_lot($aWMSdata);
            $aShip_data = getShip_confirm_data($prod_lot_list);
            $aPack = getPack($prod_lot_list);
                if(empty($aWMSdata) || empty($aShip_data) || empty($aPack) ){
                    
                    SendEmail(
                        "Can Not! Data File Transfer to WD Date : ",
                        "Error Generate file detail below.",
                        "Due to data is null","team"
                    );  
                    exit(); 
                    
                }

                //exit();
                
            $aCus_pn = array();
            $aDo = array();
            $Do_ck = '';
            $model_name = '';
            $bit_pn ='';
                foreach($aWMSdata as $DOkey_file => $aDOrs_file){
                    
                    if ($Do_ck == ''){
                        $Do_ck = $DOkey_file;
                        array_push($aDo,$DOkey_file);
                    }
                                    
                    if ($Do_ck != $DOkey_file ){
                        array_push($aDo,$DOkey_file);                       
                    }
                    
                    foreach($aDOrs_file as $STRkey_file => $aSTR_file){
                        foreach($aSTR_file as $Prodkey_file => $aProd_file){
                                        
                        array_push($aCus_pn,$aProd_file['customer_pn']);
                        $bit_pn = $aProd_file['item_no'];           
                        }
                    }
                }
                
            $result = check_model($aCus_pn);
                if ($result == 'false' ){
                    $model_name = 'All';
                  }else{
                    $name = get_model_name($bit_pn);
                    $index_cut = strpos($name,"(");
                    $model_name = substr($name,0,$index_cut-1); 
                  }
            
            $Ship_to_file_name = "";
                if ($ship_to_location == 'Hub' ){
                    $Ship_to_file_name = 'S0005';
                }else{
                    $Ship_to_file_name = 'Z0005'; 
                }
            
            $running_db = getRunning();
            //$running_db=98;
            $digit = 3 ;
            $running = sprintf("%0".$digit."d",$running_db);
            $current_date_file = date("Ymd");
            //$current_date_file='20250619';
            
            
            $file_name = $Ship_to_file_name."_" . $type ."_" . $current_date_file ."_000000_BEL_FLEX_" . $model_name . "_" .$running.".csv";       
            $file = fopen('/var/www/html/prodline/hgst/fca/fca_shipment_ftp_to_wd' . '/file_bit_log/'.$file_name, 'wb');
            fputcsv($file, array('SupplierName', 'PartName', 'SHIPDATE', 'INVNUM', 'Transfer Order',
                                'PARTNUMBER', 'Pallet Number','MODEL' ,'Plt','QTY','SUBINVENTORY','Build Name','ETA','Time',
                                'shipper','Truck or Air','Ship to','DN#', 'Remark','BOXID', 'BOXQTY','PACKID','PACKQTY', 'TRAYID','SERIAL' 
                                ));
            $sum_qty = 0 ;
            $total_qty = 0 ;
            $do_ck_qty  = "";
             foreach($aWMSdata as $DOkey => $aDOrs){
                        foreach($aDOrs as $STRkey => $aSTR){
                            foreach($aSTR as $Prodkey => $aProd){
                                if ($do_ck_qty == ""){
                                    $do_ck_qty = $DOkey;
                                    $total_qty = $aProd['qty']; 
                                }
                                 if ($do_ck_qty != $DOkey ){
                                    $total_qty += $aProd['qty'];
                                    $do_ck_qty = $DOkey;   
                                 }
                                if (isset($aPack[$Prodkey])){
                                    
                                    foreach($aPack[$Prodkey] as $Packkey => $aPack_data){
                            
                                        $do_sub = substr($DOkey, 0, 4);
                                        $do_type = $aPrefix_type[$do_sub]['ship_to'];
                                        $ship_date = $aShip_data[$Prodkey]['ship_date'];
                                        $po = $aProd['po_no'];
                                        $cus_pn = $aProd['customer_pn'];
                                        $pallet_running = $aShip_data[$Prodkey]['pallet_running'];
                                        $model = $aProd['model_name'];
                                        $pallet_qty = $aShip_data[$Prodkey]['qty_pallet'];
                                        //$box_id = $aShip_data[$Prodkey]['box_detail'];
                                        $box_id = $DOkey."||".intval($aProd['qty_boxs'])."||".$aShip_data[$Prodkey]['box_ship_name'];
                                        //$box_qty = $aProd['qty_boxs']; 
                                        $box_qty = intval($aProd['qty_boxs']); 
                                        $pack_id = $aPack_data['pack_id'];
                                        $pack_qty = $aPack_data['pack_size'];
                                        $sum_qty += $pack_qty;
                                        $build_name = getremark_in_wms_hit_fgrec_data($aPack_data['prod_lot']);

                                     if ($ship_to_location == 'Direct' ){
                                        $Subv = 'RMCOI-T2';
                                     }else{
                                        $Subv = ''; 
                                     }
                                        
                                     if ($ship_date != "" && $DOkey != "" && $po != "" &&
                                       $cus_pn != "" && $pallet_running  != "" && $model != "" && $pallet_qty != "" &&
                                       $do_type != "" && $box_id != "" && $box_qty != ""&& $pack_id != "" && $pack_qty != "" ){
                                         
                                        $data = array('Belton', 'FCA',$ship_date, $DOkey, $po,$cus_pn,$pallet_running,$model,'1',
                                                        $pallet_qty,$Subv,$build_name,'','','','Truck',$do_type,'', '',$box_id,$box_qty, 
                                                        $pack_id,$pack_qty, '',''
                                        );
                                                               
                                        fputcsv($file, $data);
                                        //fputcsv($file_test, $data);
                                    }
                                }
                                   
                            }else{
                                echo 'Prodlot : '.$Prodkey;
                                SendEmail(
                                    "Can Not! Data File Transfer to WD Date : ",
                                    "Error uploading file detail below.",
                                    "Due to data packing not found #please help check pack id on DO shipment current !!","team"
                                );
                                exit();  
                            }      
                        }
                    }
                }
                fclose($file);
                sleep(2);
                echo 'Sum Qty : '.$sum_qty.' Total Qty : '.$total_qty;
                echo "<br>";
                //exit();   
                if ($sum_qty != $total_qty){
                    echo $DOkey ." Fail QTY not equal";
                    // SendEmail(
                    //     "Can Not! Data File Transfer to WD Date : ",
                    //     "Error uploading file detail below.",
                    //     "Due to QTY packing not equal QTY shipment #please help check QTY all pack and QTY all shipment current !!","team"
                    // );
                    // exit();    
                }else{
                    echo $DOkey ." Pass ";
                    echo "<br>";
                    //====== transfer to QE log ============//
                    $source = '/var/www/html/prodline/hgst/fca/fca_shipment_ftp_to_wd/file_bit_log/'.$file_name; 
                    $destination = '/var/www/html/prodline/hgst/fca/fca_shipment_ftp_to_wd/file_bit_qe/'.$file_name;
                    //====== transfer to QE log  ============// 

                    if( !copy($source, $destination) ) { 
                        SendEmail(
                            "Can Not! Data File Transfer to WD Date : ",
                            "Error uploading file detail below.",
                            "Due to (Can Not! Transfer file to QE )","team"
                        );  
                        exit();        
                    }else{
                        echo $DOkey ." Copy Pass ";
                        echo "<br>";
                        //update_running($running_db);
                        //insert_log($aDo);
                        //====== transfer to customer ============//
                        //Send_to_customer($file_name,$running_db,$aDo);
                        //====== transfer to customer ============//
                    }
                }
    }

    function getremark_in_wms_hit_fgrec_data($prod_lot_id)
    {   
        //$DB_WMS = new DB('BITINTRA');
        $DB_WMS = new DB('BITINTRA_REAL');
        $remark= "";
        
        $strSQL="SELECT remark FROM WMS.HIT_FGREC_DATA WHERE prod_lot='".$prod_lot_id."' LIMIT 1";
        $query = $DB_WMS->getQuery($strSQL);
        if($DB_WMS->valueRow > 0)
        {
            $data = $DB_WMS->getData($query);

            $remark = $data['remark']; 
        }
        
        return $remark;
    }

    function Send_to_customer($file_name_sennd, $running_current, $do_no) {
        $aConfig = get_config();
        $aConfig_transfer = explode(",", $aConfig);
        $ftp_hostname = $aConfig_transfer[0];
        $ftp_username = $aConfig_transfer[1];
        $ftp_password = $aConfig_transfer[2]; 
        $local_dir = $aConfig_transfer[3].$file_name_sennd;
        $remote = $aConfig_transfer[4].$file_name_sennd;

            if (!file_exists($local_dir)) {
                SendEmail("Can Not! Data File Transfer to WD", "File not found", "Path: ".$local_dir."", "user");
                return;
            }

            if (filesize($local_dir) == 0) {
                SendEmail("Can Not! Data File Transfer to WD", "Local file size is 0 bytes", "File: ".$local_dir."", "user");
                return;
            }

            $key = PublicKeyLoader::load(file_get_contents('Belton.ppk'));
            $sftp = new SFTP('sftp2.wdc.com');
            
            if (!$sftp->login('Belton', $key)) {
                SendEmail("Can Not! Data File Transfer to WD", "SFTP login failed", "", "user");
                return;
            }

            echo "login SFTP: Completed\n";

            if (!$sftp->put($remote, $local_dir, SFTP::SOURCE_LOCAL_FILE)) {
                SendEmail("Can Not! Data File Transfer to WD", "Error uploading file detail below", "Missing data file at customer site", "user");
                return;
            }

            $directory = $sftp->rawlist('/');
            $size = 0;
            foreach ($directory as $filedt) {
                if ($filedt['filename'] == $file_name_sennd) {
                    $size = $filedt['size'];
                }
            }

            if ($size == 0) {
                $sftp->delete($remote);
                SendEmail("Can Not! Data File Transfer to WD", "Remote file size = 0 byte", "Deleted remote file", "user");
                return;
            }
            echo "Send to customer completed\n";
            SendEmail("Completed Data File Transfer to WD", "File uploaded successfully", "File Name: ".$file_name_sennd."", "user");

        update_running($running_current);
        insert_log($do_no);
    }
       
    function check_model($data){
            $aRS = 'true';
            $j = count($data);
            $cus_pn = '' ;
            for($i = 0; $i < $j ; $i++) {
                if ($cus_pn ==''){
                  $cus_pn = $data[$i];  
                }
                
                if ($cus_pn != $data[$i]){
                   $aRS = 'false';
                }
            }
            return $aRS;
    }
    
    function getRunning(){
            $aRS = '';
            $DB_WMS = new DB('BITINTRA');
            //$DB_WMS = new DB('BITINTRADEV4');
            $DB_WMS->errorShow = true;
            ;
            $sql = "SELECT running_transfer FROM WMS.HIT_RUNNING_TRANSFER_CUSTOMER_FTP"; 
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found running )","team"
                );  
                exit(); 

            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS = $rs['running_transfer'];
            }
            return $aRS;
    }
    function update_running($running){
            $DB_WMS = new DB('BITINTRA');
            //$DB_WMS = new DB('BITINTRADEV4');
            $DB_WMS->errorShow = true;
            
             if ($running == 999){
                $running = 0 ;
            }
            
            $running_update = $running + 1 ; 
            $arrM = array( 
                    "running_transfer"=>$running_update
                    );
            $DB_WMS->UpdateData("WMS.HIT_RUNNING_TRANSFER_CUSTOMER_FTP",$arrM ,"" ,false);

            //exit();
    } 
    function insert_log($do_arr){
            $DB_WMS = new DB('BITINTRA');
            //$DB_WMS = new DB('BITINTRADEV4');
            $DB_WMS->errorShow = true;
            
            $j = count($do_arr);
            for($i = 0; $i < $j ; $i++) {
              $arrM = array( 
                    "do_no"=>$do_arr[$i],
                    "dt_do_transfer"=>"_current_timestamp"
              );
              $DB_WMS->InsertData("WMS.HIT_TRANSFER_DATA_LOG_FTP",$arrM );   
            }
    }
     //============= send file ========================//  
     
     
    //============== send mail ========================//
    function SendEmail($title_msg,$detail_1,$detail_2,$alert_to) {
        global $SETTING;
        $aMail = get_send_mail();
        $to = "";
        $cc = "";
        $msg = '
            <meta http-equiv="Content-Type" content="text/html; charset=windows-874"> 
            <b>Dear all Concern</b>  
            <br> 
            <br>&nbsp;&nbsp;&nbsp;&nbsp;'.$detail_1.'
            <br>  
            <br><font color="#1C2951">&nbsp;&nbsp;&nbsp;&nbsp;'.$detail_2.'
            <br>
            <br><br><font color="#FF0000" size="2"> ## This message sending from system. Please do not reply this massage ## </font><br>
            ';
            
        if ($alert_to == "user"){
            $to = $aMail['alert_to_user_ftp']['mail_user'];
            $cc = $aMail['alert_cc_user_ftp']['mail_user'];  
        }else{
            $to = $aMail['alert_to_team_ftp']['mail_user'];
            $cc = $aMail['alert_cc_team_ftp']['mail_user'];    
        }

        $mail = $SETTING->root->Mail();
        $from = "bit-it.appsupport@beltontechnology.com";
        $bcc = '';
        //********* 
        $current_date = date("d-m-Y");
        $current_time = date("H");
        $time_check = intval($current_time);
        $time = ""; 
        switch ($time_check) {
            case (8):
                $time = "07:00 - 08:00";
            break;
            case (9):
                $time = "08:00 - 09:00";  
            break;
            case (10):
                $time = "09:00 - 10:00";  
            break;
            case (11):
                $time = "10:00 - 11:00";  
            break;
            case (12):
                $time = "11:00 - 12:00";  
            break;
            case (13):
                $time = "12:00 - 13:00";  
            break;
            case (14):
                $time = "13:00 - 14:00";  
            break;
            case (15):
                $time = "14:00 - 15:00";  
            break;
            case (16):
                $time = "15:00 - 16:00";  
            break;
            case (17):
                $time = "16:00 - 17:00";  
            break;
            case (18):
                $time = "17:00 - 18:00";  
            break;
            case (19):
                $time = "18:00 - 19:00";  
            break;
            case (20):
                $time = "19:00 - 20:00";  
            break;
            case (21):
                $time = "20:00 - 21:00";  
            break;
            case (22):
                $time = "21:00 - 22:00";  
            break;
            case (23):
                $time = "22:00 - 23:00";  
            break;
            case (0):
                $time = "23:00 - 00:00";  
            break;
            case (1):
                $time = "00:00 - 01:00";  
            break;
            case (2):
                $time = "01:00 - 02:00";  
            break;
            case (3):
                $time = "02:00 - 03:00";  
            break;
            case (4):
                $time = "03:00 - 04:00";  
            break;
            case (5):
                $time = "04:00 - 05:00";  
            break;
            case (6):
                $time = "05:00 - 06:00";  
            break;
            case (7):
                $time = "06:00 - 07:00";  
            break;
        break;
        
        default:
            $time="" ;
        }
        $attach='';
        $title = $title_msg.$current_date." Time : ".$time." FTP Western Digital";
        $system = "system";
        $mail->phpMailer();
        $mail->sendMail($title, $msg, $from, $to, $cc, $bcc, $attach, $system);
}
    //============== end send mail ========================//    
?>