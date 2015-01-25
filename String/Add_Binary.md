Given two binary strings, return their sum (also a binary string).

For example,
a = "11"
b = "1"
Return "100".

```java
public class Solution {
    public String addBinary(String a, String b) {
        
        StringBuffer myBuffer = new StringBuffer();
        int i = a.length()-1;
        int j = b.length()-1;
        int remain = 0;
        while(i>=0 || j >=0 || remain>0){
            int digit = remain;
            if(i>=0){
                digit+=a.charAt(i)-'0';
            }
            if(j>=0){
                digit+=b.charAt(j) - '0';
            }
            if(digit >=2){
                remain = 1;
                digit -=2;
            }
            else remain = 0;
            
            myBuffer.insert(0,digit);
            i--;
            j--;
        }
        
       
        return myBuffer.toString();
    }
    
   
}
```