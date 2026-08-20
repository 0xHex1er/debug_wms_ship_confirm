<title>"WD"</title>
<?php
include_once('/var/www/html/prodline/hgst/fca/fca_shipment_ftp_to_wd/config/connection.php');  
include_once('/var/www/html/prodline/hgst/fca/fca_shipment_ftp_to_wd/function/fun.php');
$current_date = date("Y-m-d");
$current_date = '2026-08-10';
//Send_to_Test();
$aDOdata = getDO($current_date);
$aPrefix_type = get_prefix_type();
$do_prb_direct = '';
$do_prb_hub = '';
$do_bpi_direct = ''; 
$do_bpi_hub = ''; 
if(empty($aDOdata)){
    exit();  
};
foreach($aDOdata as $key => $aDOdt){
     $do_sub = substr($key, 0, 4);
     
     if(isset($aPrefix_type[$do_sub]['type'])){
           $do_type = $aPrefix_type[$do_sub]['type'];
           
           if ($do_type == 'PRB'){
                if($aDOdt['ship_to_location'] == 'VMI-Hub'){
                    $do_prb_hub .= ($do_prb_hub == '' ? "'".$key."'" : ",'".$key."'"); 
                }else{
                    $do_prb_direct .= ($do_prb_direct == '' ? "'".$key."'" : ",'".$key."'");
                }  
           }
           if ($do_type == 'BPI'){
                $do_bpi_direct .= ($do_bpi_direct == '' ? "'".$key."'" : ",'".$key."'");    
           }
     }   
}
//=== Ship to PRB Direct and hub=====
if($do_prb_direct != ''){
    //gen_data_and_send_file($do_prb_direct,'PRB',$aPrefix_type,'Direct');
}
if($do_prb_hub != ''){
    //gen_data_and_send_file($do_prb_hub,'PRB',$aPrefix_type,'Hub');
}
//=== Ship to PRB Direct and hub===== 
  
//=== Ship to BPI Direct and hub===== 
if($do_bpi_direct != ''){
    gen_data_and_send_file($do_bpi_direct,'BPI',$aPrefix_type,'Hub');
}
//=== Ship to BPI Direct and hub===== 
exit();   
?>
