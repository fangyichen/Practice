Given a non-negative number represented as an array of digits, plus one to the number.

The digits are stored such that the most significant digit is at the head of the list.

```java
public class Solution {
    public int[] plusOne(int[] digits) {
        if(digits.length == 0){
            int[] result = new int[1];
            result[0] = 1;
            return result;
        }
        int remain= 1;
        for(int i = digits.length-1; i >= 0; i--){
            if(digits[i]+remain == 10){
                if(i == 0){
                    int[] result = new int[digits.length+1];
                    result[0] = 1;
                    return result;
                }
                digits[i] = 0;
            }
            else{
                digits[i] += remain;
                break;
            }
        }
        return digits;
    }
}
```