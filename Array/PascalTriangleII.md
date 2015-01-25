Given an index k, return the kth row of the Pascal's triangle.

For example, given k = 3,
Return [1,3,3,1].

Note:
Could you optimize your algorithm to use only O(k) extra space?

```java
public class Solution {
    public List<Integer> getRow(int rowIndex) {
    List<Integer> result=new ArrayList<Integer>();
    if(rowIndex<0)return result;
    if(rowIndex == 0) {
        result.add(1);
        return result;
    }
    result = getRow(rowIndex-1);
    int diff = result.get(0);
    int newNum = 0;
    for(int i = 0; i <= rowIndex; i++){
        
       
        if(i == rowIndex) {
            result.add(1);
            break;
        }
        if(i > 0){
            newNum = diff+result.get(i);
            diff = result.get(i);
            result.set(i,newNum);
        }
    }
    return result;

    }
}
```                
 