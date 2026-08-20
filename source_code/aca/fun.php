<?php
//include('/var/www/html/prodline/hgst/carriage/carriage_shipment_ftp_to_wd/Net/SFTP.php');
//include_once('class_setting_wms.php'); 

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
            $sql = "SELECT s.do,p.ship_to_location FROM WMS.HGSTACA_SHIP_CONFIRM s 
                    INNER JOIN WMS.lrv_wms_check_confirm_log l on s.plan_id = l.plan_id
                    INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
                    WHERE DATE(s.date) =  '".$date."' AND s.type = 'PACK'
                    ORDER BY s.do ";
            // $sql = "SELECT s.do,p.ship_to_location FROM WMS.HGSTACA_SHIP_CONFIRM s 
            //         INNER JOIN WMS.lrv_wms_check_confirm_log l on s.plan_id = l.plan_id
            //         INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
            //         WHERE DATE(s.date) =  '".$date."' AND s.type = 'PACK'
            //         AND s.do NOT IN (SELECT do_no FROM WMS.HGSTACA_TRANSFER_DATA_LOG) 
            //         ORDER BY s.do ";
            // echo $sql;
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            
            { 
                //echo '<script type="text/javascript"> alert(" Not found data current shipment  \n");</script>';
                return array();
            }
            while($rs = $DB_WMS->getData($query))
            {
                $aDOdata[$rs['do']] = $rs;
            }
            return $aDOdata;
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
           $sql = " 
           SELECT s.pallet_no as pallet_running ,s.box_detail,DATE_FORMAT(s.date,'%d-%M-%Y') as ship_date ,d.qty_pallet,s.prod_lot,s.qty,s.box
           FROM WMS.HGSTACA_SHIP_CONFIRM s
           INNER JOIN WMS.HGSTACA_PALLET_DATA d
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
                exit();
            }
            while($rs = $DB_WMS->getData($query))
            {
               $aRS[$rs['prod_lot']][$rs['box']] = $rs;
            } 
            return $aRS;
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
            SELECT d.plan_id,d.do_no,p.customer_pn,p.item_no,p.model_name ,p.qty,m.store_lot,m.prod_lot,m.lot_size as qty_boxs,p.po_no,m.box_no
            FROM (WMS.SHIPMENTDO_DATA d INNER JOIN WMS.SHIPMENTPLAN_DATA p on d.plan_id = p.plan_id ) 
            INNER JOIN WMS.HGSTACA_MATCH_DATA m on d.do_no = m.do_no
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
                $aWMSdata[$rs['do_no']][$rs['store_lot']][$rs['prod_lot']][$rs['box_no']] = $rs;
            }

          

            return $aWMSdata;
    }
 
     function getPackWMS($store_lot){
            //global $db;
            $aWMSdata = array();
            //$DB_WMS = new DB('BITINTRA');
            $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            if($store_lot == '' )
            {
                return $aWMSdata;
            }
            $sql = " 
            SELECT b.store_lot,b.box_no,b.prod_lot,pack_id
            FROM WMS.HGSTACA_FGREC_BOX b
            INNER JOIN WMS.HGSTACA_FGREC_PACK p
            ON b.id=p.box_id
            WHERE  b.store_lot  in 
            (".$store_lot.")
            AND b.box_status = 'Active'";
            $query = $DB_WMS->getQuery($sql);
            if($DB_WMS->valueRow < 1)
            {
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error Generate file detail below.",
                    "Due to ( Not found data pack id in WMS )","team"
                ); 
                exit(); 
                
            }
            while($rs = $DB_WMS->getData($query))
            {
                $aWMSdata[$rs['store_lot']][$rs['box_no']][$rs['prod_lot']][$rs['pack_id']] = $rs;
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
             FROM WMS.HGSTACA_SHIP_TO_MASTER 
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
            $sql = " SELECT * FROM WMS.HGSTACA_FTP_CONFIG "; 
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
            // $DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS = new DB('BITINTRA');
            $DB_WMS->errorShow = true;
            ;
            $sql = " SELECT mail_send_to,mail_user FROM WMS.HGSTACA_MAIL_ALERT "; 
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


    function getPack($Pack_id){
            //global $db;
            $aRS = array();
            if($Pack_id == '')
            {
                return $aRS;
            }
            $DBHGST = new DB('HGSTACA02');
            //$DBHGST = new DB('BITINTRA_REAL');
            $DBHGST->errorShow = true
            ;
            $sql = " 
            SELECT pack_id,tot_qty_pack,barcode 
            FROM HGSTACA.PACK_HEADER
            WHERE pack_id IN
            (
            ".$Pack_id."
            )
             ";
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
               $aRS[$rs['pack_id']] = $rs;
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
    
    function  prepareStore_lot($aWMSdata){
        $RS = '';
        foreach($aWMSdata as $key => $dtDO){
            foreach($dtDO as $keySt_lot => $dtSt_lot){
                $RS .= ($RS == '' ? "'".$keySt_lot."'" : ",'".$keySt_lot."'");
            }   
        }
        return $RS;
    }
    
     function  preparePackID($aPack){
        $RS = '';
        foreach($aPack as $Stkey => $dtSt){
            foreach($dtSt as $Boxkey => $dtBox){
                foreach($dtBox as $Prodkey => $dtProd){
                    foreach($dtProd as $Packkey => $dtPack){
                        $RS .= ($RS == '' ? "'".$Packkey."'" : ",'".$Packkey."'");  
                    }
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
            $store_lot_list = prepareStore_lot($aWMSdata);
            $aPack_in_wms = getPackWMS($store_lot_list);
            $pack_list =  preparePackID($aPack_in_wms);
            $aPackACA = getPack($pack_list);
            // print_r($aPack_in_wms);
            // exit();
            if(empty($aWMSdata) || empty($aShip_data) || empty($aPack_in_wms)|| empty($aPackACA) ){
                    
                    SendEmail(
                        "Can Not! Data File Transfer to WD Date : ",
                        "Error Generate file detail below.",
                        "Due to data is null","team"
                    );  
                    exit();     
            }
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
                        foreach($aProd_file as $Boxkey_file => $aBox_file){
                         array_push($aCus_pn,$aBox_file['customer_pn']);
                        $bit_pn = $aBox_file['item_no'];   
                        }               
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
                $Ship_to_file_name = 'S0004';
            }else{
                $Ship_to_file_name = 'Z0004'; 
            }
            
            $running_db = getRunning();
            $digit = 3 ;
            $running = sprintf("%0".$digit."d",$running_db);
            $current_date_file = date("Ymd");
            
            $file_name = $Ship_to_file_name."_" . $type ."_" . $current_date_file ."_000000_BEL_CARRIAGE_" . $model_name . "_" .$running.".csv";       
            $file = fopen('/var/www/html/prodline/hgst/carriage/carriage_shipment_ftp_to_wd' . '/file_bit_log/'.$file_name, 'wb');
            fputcsv($file, array('SupplierName', 'PartName', 'SHIPDATE', 'INVNUM', 'Transfer Order',
                                'PARTNUMBER', 'Pallet Number','MODEL' ,'Plt','QTY','SUBINVENTORY','Build Name','ETA','Time',
                                'shipper','Truck or Air','Ship to','DN#', 'Remark','BOXID', 'BOXQTY','PACKID','PACKQTY', 'TRAYID','SERIAL'
            ));
                                    
            $sum_qty = 0 ;
            $total_qty = 0 ;
            $do_ck_qty  = "";

            $min_expire_dates_by_pack_prefix = []; 

            foreach($aWMSdata as $DOkey => $aDOrs){ // ยังคงวนลูป $aWMSdata เพื่อให้แน่ใจว่าเข้าถึงข้อมูล PackKey ได้ครบถ้วน
                foreach($aDOrs as $STRkey => $aSTR){
                    foreach($aSTR as $Prodkey => $aProd){
                        foreach($aProd as $BoxKey => $aBox){ 
                            if (isset($aPack_in_wms[$STRkey][$BoxKey][$Prodkey])) {
                                foreach($aPack_in_wms[$STRkey][$BoxKey][$Prodkey] as $PackKey => $aPack){
                                    
                                    $date_string = substr($PackKey, 4, 6); // 250707 หรือ 250705

                                    $year_short = substr($date_string, 0, 2); 
                                    $month = substr($date_string, 2, 2); 
                                    $day = substr($date_string, 4, 2);   

                                    $full_year = (intval($year_short) + 2000) + 2; 

                                    if ($month == '02' && $day == '29' && !checkdate(2, 29, $full_year)) {
                                        $day = '28'; 
                                    }    
                                    $current_expire_date_str = "{$full_year}-{$month}-{$day}";
                                    $grouping_key = substr($PackKey, 0, 7); 
                                    if (!isset($min_expire_dates_by_pack_prefix[$grouping_key])) {
                                        $min_expire_dates_by_pack_prefix[$grouping_key] = $current_expire_date_str;
                                    } else {
                                        if (strtotime($current_expire_date_str) < strtotime($min_expire_dates_by_pack_prefix[$grouping_key])) {
                                            $min_expire_dates_by_pack_prefix[$grouping_key] = $current_expire_date_str;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            foreach($aWMSdata as $DOkey => $aDOrs){
                foreach($aDOrs as $STRkey => $aSTR){
                    foreach($aSTR as $Prodkey => $aProd){
                        foreach($aProd as $BoxKey => $aBox){
                            foreach($aPack_in_wms[$STRkey][$BoxKey][$Prodkey] as $PackKey => $aPack){   
                                if ($do_ck_qty == ""){
                                        $do_ck_qty = $DOkey;
                                        $total_qty = $aBox['qty']; 
                                }
                                if ($do_ck_qty != $DOkey ){
                                        $total_qty += $aBox['qty'];
                                        $do_ck_qty = $DOkey;   
                                }
                                $tray_id = $aPackACA[$PackKey]['barcode'];
                                $pack_qty = $aPackACA[$PackKey]['tot_qty_pack'];
                                $box_qty  = $aShip_data[$Prodkey][$BoxKey]['qty'];
                                $box_id  = $aShip_data[$Prodkey][$BoxKey]['box_detail'];
                                $do_sub = substr($DOkey, 0, 4);
                                $ship_to = $aPrefix_type[$do_sub]['ship_to'];
                                $pallet_qty = $aShip_data[$Prodkey][$BoxKey]['qty_pallet'];
                                $model = $aBox['model_name'];
                                $pallet_running = $aShip_data[$Prodkey][$BoxKey]['pallet_running'];
                                $cus_pn = $aBox['customer_pn'];

                                if (strlen($cus_pn)> 7 ){
                                    $cus_pn=substr($cus_pn,0,7);
                                }
                                    
                                $po = $aBox['po_no'];
                                $ship_date = $aShip_data[$Prodkey][$BoxKey]['ship_date'];
                                $sum_qty += $pack_qty;
                                    
                                if ($ship_to_location == 'Direct' ){
                                        $Subv = 'RMCOI-T2';
                                }else{
                                        $Subv = ''; 
                                }
                                    
                                $expire_date = ''; 
                                $grouping_key_for_lookup = substr($PackKey, 0, 7); 
                                if (isset($min_expire_dates_by_pack_prefix[$grouping_key_for_lookup]) && !empty($min_expire_dates_by_pack_prefix[$grouping_key_for_lookup])) {
                                    try {
                                        $dt = new DateTime($min_expire_dates_by_pack_prefix[$grouping_key_for_lookup]);
                                        $expire_date = $dt->format('d-F-Y'); 
                                    } catch (Exception $e) {
                                        $expire_date = 'Invalid Date'; 
                                    }
                                }
                                
                                if ($tray_id != "" && $pack_qty != "" && $box_qty != "" && $DOkey != "" &&
                                    $box_id != "" && $ship_to  != "" && $pallet_qty != "" && $model != "" &&
                                    $pallet_running != "" && $cus_pn != "" && $po != ""&& $ship_date != "" &&
                                    $PackKey != "" ){
                                                
                                    if(strlen($aBox['customer_pn']) == 18){
                                        $box_id_separate = explode("||",$box_id);
                                        $box_id =$box_id_separate[0]."||".substr($box_id_separate[1],0,7)."||".$box_id_separate[2]."||".$box_id_separate[3];
                                        $cus_pn = $aBox['customer_pn'];
                                    }
                                        $data = array('Belton', 'Carriage',$ship_date, $DOkey, $po,$cus_pn,$pallet_running,$model,'1',
                                                    $pallet_qty, $Subv,'','','','','Truck',$ship_to,'', $expire_date, $box_id, $box_qty, 
                                                    $PackKey ,$pack_qty,$tray_id ,''
                                                );              
                                        fputcsv($file, $data);
                                }
                            }
                        }   
                    }
                }
            }
            echo "Total QTY Packing : ".$sum_qty."\n";
            echo "Total QTY Shipment : ".$total_qty."\n";
            //exit();  
            if ($sum_qty != $total_qty){
               
                SendEmail(
                   "Can Not! Data File Transfer to WD Date : ",
                   "Error uploading file detail below.",
                   "Due to QTY packing not equal QTY shipment #please help check QTY all pack and QTY all shipment current !!","team"
                );
                   exit();    
            }else{
                 //====== transfer to QE log ============//
                $source = '/var/www/html/prodline/hgst/carriage/carriage_shipment_ftp_to_wd/file_bit_log/'.$file_name; 
                $destination = '/var/www/html/prodline/hgst/carriage/carriage_shipment_ftp_to_wd/file_bit_qe/'.$file_name;
                //====== transfer to QE log  ============// 

                if( !copy($source,$destination) ) { 
                    SendEmail(
                        "Can Not! Data File Transfer to WD Date : ",
                        "Error uploading file detail below.",
                        "Due to (Can Not! Transfer file to QE )","team"
                    );  
                    exit();        
                }else{ 
                    echo "Copy QE log: Completed\n";
                //     SendEmail(
                //     "Completed Data File Transfer to WD Date : ",
                //     "File uploaded successfully detail below.",
                //     "File Name :". $file_name,"user"
                // );
                     //====== transfer to customer ============//
                     //Send_to_customer($file_name,$running_db,$aDo);
                     //====== transfer to customer ============//
                }
                exit();                 
            }  
    }
 
    function Send_to_customer($file_name_sennd,$running_current,$do_no){
        $aConfig = get_config();
        $aConfig_transfer = explode(",", $aConfig);
        $ftp_hostname = $aConfig_transfer[0];
        $ftp_username = $aConfig_transfer[1];
        $ftp_password = $aConfig_transfer[2]; 
        $local_dir = $aConfig_transfer[3].$file_name_sennd;
        $remote = $aConfig_transfer[4].$file_name_sennd;
                     
        $key = PublicKeyLoader::load(file_get_contents('Belton_Carriage.ppk'));
        $sftp = new SFTP('sftp2.wdc.com');
        $sftp->login('Belton_Carriage', $key);

        
        if(!$sftp){
            throw new \Exception('Login failed');
            SendEmail(
                "Can Not! Data File Transfer to WD Date : ",
                "Error uploading file detail below.",
                "Due to (Can not connect DB customer )","user"
            );
            exit();
        }else{
            
            echo "login SFTP: Completed\n";
            $sftp->put($remote, $local_dir, SFTP::SOURCE_LOCAL_FILE); 
            $directory = $sftp->rawlist('/');
            $size= 0;
            
            foreach ($directory as $filedt) {
                if($filedt['filename'] == $file_name_sennd){
                    $size = $filedt['size'];
                } 
            }
            
            if($size == 0){
                SendEmail(
                    "Can Not! Data File Transfer to WD Date : ",
                    "Error uploading file detail below.",
                    "Due to ( Not found file to DB customer #Size file = 0 byte)","user"
                );
            $sftp->delete($remote);
            exit();    
            }else{
                SendEmail(
                    "Completed Data File Transfer to WD Date : ",
                    "File uploaded successfully detail below.",
                    "File Name :". $file_name_sennd,"user"
                );
                
                update_running($running_current);
                insert_log($do_no);
            }
        }            
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
            //$DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS->errorShow = true;
            ;
            $sql = "SELECT running_transfer FROM WMS.HGSTACA_RUNNING_TRANSFER_CUSTOMER"; 
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
            //$DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS = new DB('BITINTRA');
            $DB_WMS->errorShow = true;
            if ($running == 999){
                $running = 0 ;
            }
            $running_update = $running + 1 ; 
            $sql = "UPDATE WMS.HGSTACA_RUNNING_TRANSFER_CUSTOMER SET running_transfer = ".$running_update;
            $query = $DB_WMS->getQuery($sql);
    } 
    function insert_log($do_arr){
            //$DB_WMS = new DB('BITINTRA_REAL');
            $DB_WMS = new DB('BITINTRA');
            $DB_WMS->errorShow = true;
            
            $j = count($do_arr);
            for($i = 0; $i < $j ; $i++) {
              $arrM = array( 
                    "do_no"=>$do_arr[$i],
                    "dt_do_transfer"=>"_current_timestamp"
              );
              $DB_WMS->InsertData("WMS.HGSTACA_TRANSFER_DATA_LOG",$arrM );   
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
            $to = $aMail['alert_to_user']['mail_user'];
            $cc = $aMail['alert_cc_user']['mail_user'];  
        }else{
            $to = $aMail['alert_to_team']['mail_user'];
            $cc = $aMail['alert_cc_team']['mail_user'];    
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
        $title = $title_msg.$current_date." Time : ".$time." FTP Carriage Western Digital";
        $system = "system";
        // $mail->phpMailer();
        // $mail->sendMail($title, $msg, $from, $to, $cc, $bcc, $attach, $system);
}
    //============== end send mail ========================//    
?>