import React, {useRef,useState} from 'react';
import {View,Text,Pressable,Linking,StyleSheet} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {parsePairQr} from '../shared/pairing.mjs';

export default function PhoneScanner({onScan}: {onScan:(data:ReturnType<typeof parsePairQr>)=>void}) {
  const [permission,requestPermission]=useCameraPermissions();
  const [error,setError]=useState('');
  const consumed=useRef(false);
  return <View style={{gap:16,paddingVertical:12}}>
    <Text style={styles.text}>כוונו אל קוד ה־QR במסך האימון. הקוד יזוהה והחיבור יושלם אוטומטית.</Text>
    {permission?.granted ? <CameraView
      style={{height:320,width:'100%',borderRadius:12}}
      facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}}
      onMountError={()=>setError('לא ניתן לפתוח את המצלמה. נסו להזין את הקוד ידנית.')}
      onBarcodeScanned={({data})=>{
        if(consumed.current)return;
        try {const result=parsePairQr(data);consumed.current=true;onScan(result);}
        catch(e){setError(e.message);}
      }} /> : <Pressable accessibilityRole="button" style={styles.button} onPress={()=>permission?.canAskAgain===false?Linking.openSettings():requestPermission()}>
        <Text style={styles.text}>{permission?.canAskAgain===false?'פתיחת הרשאות המצלמה בהגדרות':'אישור שימוש במצלמה'}</Text>
      </Pressable>}
    {!!error&&<Text style={styles.text}>{error}</Text>}
    <Text style={styles.text}>המצלמה מיועדת לקריאת הקוד בלבד. אין הקלטת וידאו או קול.</Text>
  </View>;
}
const styles=StyleSheet.create({text:{color:'white',fontSize:16,textAlign:'right',fontFamily:'Heebo'},button:{padding:16,borderRadius:8,borderWidth:1,borderColor:'#b4ff00'}});
